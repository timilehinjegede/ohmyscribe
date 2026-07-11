import { eq, sql } from "drizzle-orm";
import { answerSuggestions, assessmentTranscripts, type Db } from "@ohmyscribe/db";
import { oasisAnswerSchema, resolveSnippetRange, OASIS_ITEMS } from "@ohmyscribe/shared";
import { recordAuditEvent } from "./audit.ts";

// The provider-agnostic seam between this orchestration and a concrete model call (see openai.ts).
export type TranscriptItem = {
  code: string;
  label: string;
  responses: { value: string; label: string }[];
};
export type ExtractedAnswer = {
  itemCode: string;
  value: string;
  transcriptSnippet: string;
  confidence: number;
};
export type CallExtractModel = (
  items: TranscriptItem[],
  transcript: string,
) => Promise<ExtractedAnswer[]>;

// Drafts OASIS answers from the transcript into answer_suggestions, replacing any prior drafts
// there.
export async function extractAnswers(
  db: Db,
  assessmentId: string,
  transcript: string,
  callModel: CallExtractModel,
): Promise<number> {
  // TODO: future improvement -> M1033 is a manual clinical-judgment item (the risk-factor count) — keep it out of the AI draft until we support multi selection.
  const items: TranscriptItem[] = OASIS_ITEMS.filter((item) => item.code !== "M1033").map(
    (item) => ({
      code: item.code,
      label: item.label,
      responses: item.responses.map((response) => ({
        value: response.value,
        label: response.label,
      })),
    }),
  );

  const extracted = await callModel(items, transcript);

  // One draft per item, keeping the highest-confidence valid one — the model can hallucinate an
  // item or an off-scale value, and could name the same item twice.
  const ranked = [...extracted].sort((a, b) => b.confidence - a.confidence);
  const seen = new Set<string>();
  const drafts: ExtractedAnswer[] = [];
  for (const answer of ranked) {
    if (seen.has(answer.itemCode)) continue;
    if (!oasisAnswerSchema.safeParse({ itemCode: answer.itemCode, value: answer.value }).success) {
      continue;
    }
    seen.add(answer.itemCode);
    drafts.push(answer);
  }

  // A fresh transcript replaces the prior drafts; hard-delete since these never leave the server yet.
  // One transaction so a mid-replace failure can't wipe the old drafts and leave none behind.
  await db.transaction(async (tx) => {
    // Upsert-in-place (not delete+insert) so the update trigger bumps server_seq and the pull
    // picks up the replaced text. Persisted even when no draft survives validation.
    await tx
      .insert(assessmentTranscripts)
      .values({ assessmentId, text: transcript, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: assessmentTranscripts.assessmentId,
        set: { text: sql`excluded.text`, updatedAt: sql`excluded.updated_at` },
      });
    await tx.delete(answerSuggestions).where(eq(answerSuggestions.assessmentId, assessmentId));
    if (drafts.length === 0) return;
    await tx.insert(answerSuggestions).values(
      drafts.map((answer) => {
        const snippetRange = resolveSnippetRange(transcript, answer.transcriptSnippet);
        return {
          assessmentId,
          itemCode: answer.itemCode,
          suggestedValue: answer.value,
          transcriptSnippet: answer.transcriptSnippet,
          snippetStart: snippetRange?.start ?? null,
          snippetEnd: snippetRange?.end ?? null,
          confidence: Math.max(0, Math.min(1, answer.confidence)),
        };
      }),
    );
    for (const answer of drafts) {
      await recordAuditEvent(tx, {
        assessmentId,
        itemCode: answer.itemCode,
        event: "suggested",
        actorId: null,
      });
    }
  });
  return drafts.length;
}

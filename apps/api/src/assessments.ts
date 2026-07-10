import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  answerSuggestions,
  assessmentAnswers,
  assessments,
  assessmentTranscripts,
  visits,
  type Db,
} from "@ohmyscribe/db";
import type { PdgmResult, QualityFinding } from "@ohmyscribe/shared";
import { reconcileProvenanceOnComplete } from "./audit.ts";
import { persistQualityFlags } from "./quality-flags.ts";

// Idempotent create-or-return: a retried or concurrent POST conflicts on the visitId
// unique and re-reads the existing row instead of inserting a second assessment.
export async function getOrCreateAssessment(db: Db, visitId: string) {
  await db
    .insert(assessments)
    .values({ visitId, updatedAt: new Date() })
    .onConflictDoNothing({ target: assessments.visitId });

  const [assessment] = await db
    .select({ id: assessments.id, visitId: assessments.visitId })
    .from(assessments)
    .where(and(eq(assessments.visitId, visitId), isNull(assessments.deletedAt)));
  return assessment!;
}

export async function getAssessment(db: Db, assessmentId: string) {
  const [assessment] = await db
    .select({
      id: assessments.id,
      visitId: assessments.visitId,
      completedAt: assessments.completedAt,
      pdgmSnapshot: assessments.pdgmSnapshot,
    })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), isNull(assessments.deletedAt)));
  if (!assessment) return null;

  const answers = await db
    .select({ itemCode: assessmentAnswers.itemCode, value: assessmentAnswers.value })
    .from(assessmentAnswers)
    .where(
      and(eq(assessmentAnswers.assessmentId, assessmentId), isNull(assessmentAnswers.deletedAt)),
    );

  const suggestionRows = await db
    .select({
      itemCode: answerSuggestions.itemCode,
      value: answerSuggestions.suggestedValue,
      transcriptSnippet: answerSuggestions.transcriptSnippet,
      snippetStart: answerSuggestions.snippetStart,
      snippetEnd: answerSuggestions.snippetEnd,
      confidence: answerSuggestions.confidence,
    })
    .from(answerSuggestions)
    .where(
      and(
        eq(answerSuggestions.assessmentId, assessmentId),
        isNull(answerSuggestions.deletedAt),
        isNotNull(answerSuggestions.suggestedValue),
      ),
    );
  // suggestedValue is nullable in the table but /extract always sets it; the filter guarantees it.
  const suggestions = suggestionRows.map((row) => ({ ...row, value: row.value! }));

  const [transcriptRow] = await db
    .select({ text: assessmentTranscripts.text })
    .from(assessmentTranscripts)
    .where(
      and(
        eq(assessmentTranscripts.assessmentId, assessmentId),
        isNull(assessmentTranscripts.deletedAt),
      ),
    );
  return {
    ...assessment,
    pdgmSnapshot: assessment.pdgmSnapshot as PdgmResult | null,
    transcript: transcriptRow?.text ?? null,
    answers,
    suggestions,
  };
}

export async function upsertAnswers(
  db: Db,
  assessmentId: string,
  answers: { itemCode: string; value: string; updatedAt: string }[],
) {
  if (answers.length === 0) return;
  // Dedupe within the batch (last wins) — Postgres rejects one statement hitting the
  // same (assessmentId, itemCode) conflict key twice.
  const byItemCode = new Map(answers.map((answer) => [answer.itemCode, answer]));
  const rows = [...byItemCode.values()].map((answer) => ({
    assessmentId,
    itemCode: answer.itemCode,
    value: answer.value,
    updatedAt: new Date(answer.updatedAt),
  }));
  // Last-write-wins: a stale autosave (older device clock) must not clobber a newer one.
  await db
    .insert(assessmentAnswers)
    .values(rows)
    .onConflictDoUpdate({
      target: [assessmentAnswers.assessmentId, assessmentAnswers.itemCode],
      set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` },
      setWhere: sql`excluded.updated_at > ${assessmentAnswers.updatedAt}`,
    });
}

// Files the assessment: freezes the PDGM snapshot, stamps completedAt, marks the visit
// complete, and persists the quality findings — atomically, so a filed record is all of it or none.
export async function completeAssessment(
  db: Db,
  assessmentId: string,
  pdgm: PdgmResult,
  findings: QualityFinding[],
) {
  const now = new Date();
  await db.transaction(async (tx) => {
    const [assessment] = await tx
      .select({ visitId: assessments.visitId, assignedUserId: visits.assignedUserId })
      .from(assessments)
      .innerJoin(visits, eq(visits.id, assessments.visitId))
      .where(
        and(
          eq(assessments.id, assessmentId),
          isNull(assessments.deletedAt),
          isNull(assessments.completedAt),
        ),
      );
    if (!assessment) return; // already complete or gone — idempotent
    await tx
      .update(assessments)
      .set({ completedAt: now, updatedAt: now, pdgmSnapshot: pdgm, reviewStatus: "pending_review" })
      .where(and(eq(assessments.id, assessmentId), isNull(assessments.completedAt)));
    await tx.update(visits).set({ status: "complete" }).where(eq(visits.id, assessment.visitId));
    await persistQualityFlags(tx, assessmentId, findings);
    // Filing requests carry no user identity (no auth), so the derived accept/override
    // decisions are attributed to the visit's assigned nurse.
    await reconcileProvenanceOnComplete(tx, assessmentId, assessment.assignedUserId);
  });
}

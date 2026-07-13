import { and, desc, eq, isNull } from "drizzle-orm";
import {
  answerSuggestions,
  assessmentAnswers,
  auditLogs,
  diagnosisCodings,
  diagnosisSuggestions,
  type Db,
} from "@ohmyscribe/db";

// Drizzle's transaction object isn't assignable to Db (it has no $client); this is its type.
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type AuditEntry = {
  assessmentId: string;
  itemCode: string;
  event: "suggested" | "accepted" | "overridden";
  actorId: string | null;
};

// Append-only, but a row identical to the item's latest event is skipped, so idempotent
// re-saves and repeat extractions don't pile up duplicates.
export async function recordAuditEvent(tx: Tx, entry: AuditEntry): Promise<void> {
  const [latest] = await tx
    .select({ event: auditLogs.event })
    .from(auditLogs)
    .where(
      and(eq(auditLogs.assessmentId, entry.assessmentId), eq(auditLogs.itemCode, entry.itemCode)),
    )
    .orderBy(desc(auditLogs.serverSeq))
    .limit(1);
  if (latest?.event === entry.event) return;
  await tx.insert(auditLogs).values(entry);
}

// Derives one terminal event per live suggestion by comparing it against the filed state.
// Filing is the only deterministic convergence point: a nurse who keeps a differing answer
// never re-syncs it, so any push-path detection would miss that (real) override.
export async function reconcileProvenanceOnComplete(
  tx: Tx,
  assessmentId: string,
  actorId: string | null,
): Promise<void> {
  const liveAnswerSuggestions = await tx
    .select({
      itemCode: answerSuggestions.itemCode,
      suggestedValue: answerSuggestions.suggestedValue,
    })
    .from(answerSuggestions)
    .where(
      and(eq(answerSuggestions.assessmentId, assessmentId), isNull(answerSuggestions.deletedAt)),
    );
  const finalAnswers = await tx
    .select({ itemCode: assessmentAnswers.itemCode, value: assessmentAnswers.value })
    .from(assessmentAnswers)
    .where(
      and(eq(assessmentAnswers.assessmentId, assessmentId), isNull(assessmentAnswers.deletedAt)),
    );
  const finalValuesByItemCode = new Map(
    finalAnswers.map((answer) => [answer.itemCode, answer.value]),
  );

  for (const suggestion of liveAnswerSuggestions) {
    if (suggestion.suggestedValue === null) continue;
    const finalValue = finalValuesByItemCode.get(suggestion.itemCode);
    // A suggested but unanswered item stays pending — there is no decision to record.
    if (finalValue === undefined) continue;
    await recordAuditEvent(tx, {
      assessmentId,
      itemCode: suggestion.itemCode,
      event: finalValue === suggestion.suggestedValue ? "accepted" : "overridden",
      actorId,
    });
  }

  const liveDiagnosisSuggestions = await tx
    .select({
      diagnosisId: diagnosisSuggestions.diagnosisId,
      isPrimary: diagnosisSuggestions.isPrimary,
    })
    .from(diagnosisSuggestions)
    .where(
      and(
        eq(diagnosisSuggestions.assessmentId, assessmentId),
        isNull(diagnosisSuggestions.deletedAt),
      ),
    );
  const liveCodings = await tx
    .select({ diagnosisId: diagnosisCodings.diagnosisId, isPrimary: diagnosisCodings.isPrimary })
    .from(diagnosisCodings)
    .where(
      and(eq(diagnosisCodings.assessmentId, assessmentId), isNull(diagnosisCodings.deletedAt)),
    );
  const codedRolesByDiagnosisId = new Map(
    liveCodings.map((coding) => [coding.diagnosisId, coding.isPrimary]),
  );

  for (const suggestion of liveDiagnosisSuggestions) {
    const codedAsPrimary = codedRolesByDiagnosisId.get(suggestion.diagnosisId);
    // An AI pick the nurse never coded is a rejection, not a pending item.
    await recordAuditEvent(tx, {
      assessmentId,
      itemCode: suggestion.diagnosisId,
      event: codedAsPrimary === suggestion.isPrimary ? "accepted" : "overridden",
      actorId,
    });
  }
}

import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import {
  answerSuggestions,
  assessmentAnswers,
  assessments,
  diagnoses,
  diagnosisCodings,
  diagnosisSuggestions,
  patients,
  qualityFlags,
  assessmentTranscripts,
  visits,
  type Db,
} from "@ohmyscribe/db";
import type { SyncPushResult, SyncPushRow } from "@ohmyscribe/shared";

// Drizzle's transaction object isn't assignable to Db (it has no $client); this is its type.
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// A row the push refuses (e.g. a coding pointing at another visit's diagnosis). Thrown inside a
// per-row savepoint so it rolls back that row only and returns as `rejected`, not a batch 500.
class RejectedRow extends Error {}

// Tables the client pulls to mirror the demo loop offline. Keyed by wire name.
const PULL_TABLES = {
  visits,
  patients,
  diagnoses,
  assessments,
  assessment_answers: assessmentAnswers,
  diagnosis_codings: diagnosisCodings,
  answer_suggestions: answerSuggestions,
  diagnosis_suggestions: diagnosisSuggestions,
  quality_flags: qualityFlags,
  assessment_transcripts: assessmentTranscripts,
};

// "Everything the server has seen since cursor N." serverSeq is unique + monotonic, so `> since`
// is exact (no ties), and the cursor advances only to the max serverSeq actually returned; a row
// committed mid-pull gets a higher seq and lands next pull.
export async function pull(
  db: Db,
  since: number,
): Promise<{ changes: Record<string, unknown[]>; cursor: number }> {
  return db.transaction(
    async (tx) => {
      const changes: Record<string, unknown[]> = {};
      let cursor = since;
      for (const [name, table] of Object.entries(PULL_TABLES)) {
        const rows = await tx
          .select()
          .from(table)
          .where(gt(table.serverSeq, since))
          .orderBy(table.serverSeq);
        changes[name] = rows;
        for (const row of rows) {
          const seq = (row as { serverSeq: number }).serverSeq;
          if (seq > cursor) cursor = seq;
        }
      }
      return { changes, cursor };
    },
    { isolationLevel: "repeatable read" },
  );
}

// The LWW gate skipped the update (equal or older version). Equal → an idempotent re-push, so ack
// it "applied" with the stored serverSeq (else the client can never clear pending). Older → stale.
async function resolveSkipped(
  tx: Tx,
  table: typeof assessmentAnswers | typeof diagnosisCodings,
  id: string,
  updatedAt: Date,
): Promise<SyncPushResult> {
  const [current] = await tx
    .select({ updatedAt: table.updatedAt, serverSeq: table.serverSeq })
    .from(table)
    .where(eq(table.id, id));
  if (current && current.updatedAt.getTime() === updatedAt.getTime()) {
    return { id, status: "applied", serverSeq: current.serverSeq };
  }
  return { id, status: "stale" };
}

async function pushRow(tx: Tx, row: SyncPushRow): Promise<SyncPushResult> {
  const updatedAt = new Date(row.updatedAt);
  const deletedAt = row.deletedAt ? new Date(row.deletedAt) : null;

  if (row.table === "assessment_answers") {
    const [applied] = await tx
      .insert(assessmentAnswers)
      .values({
        id: row.id,
        updatedAt,
        deletedAt,
        assessmentId: row.assessmentId,
        itemCode: row.itemCode,
        value: row.value,
      })
      .onConflictDoUpdate({
        target: assessmentAnswers.id,
        set: {
          updatedAt: sql`excluded.updated_at`,
          // LWW: a newer write wins, including a re-add that clears the tombstone. A stale edit is
          // gated out by setWhere below, so it can't resurrect a delete.
          deletedAt: sql`excluded.deleted_at`,
          value: sql`excluded.value`,
        },
        setWhere: sql`excluded.updated_at > ${assessmentAnswers.updatedAt}`,
      })
      .returning({ serverSeq: assessmentAnswers.serverSeq });
    if (applied) return { id: row.id, status: "applied", serverSeq: applied.serverSeq };
    return resolveSkipped(tx, assessmentAnswers, row.id, updatedAt);
  }

  // The FK proves the diagnosis exists, not that it belongs to this assessment's visit.
  const [valid] = await tx
    .select({ id: diagnoses.id })
    .from(diagnoses)
    .innerJoin(assessments, eq(assessments.visitId, diagnoses.visitId))
    .where(
      and(
        eq(assessments.id, row.assessmentId),
        eq(diagnoses.id, row.diagnosisId),
        isNull(diagnoses.deletedAt),
      ),
    );
  if (!valid) throw new RejectedRow("diagnosis not in this assessment's visit");

  // A winning primary demotes the current one (mirrors upsertCoding) so the partial one-primary
  // index can't collide. Gate on the LWW win so a stale promote doesn't clear the live primary.
  if (row.isPrimary && !deletedAt) {
    const [existing] = await tx
      .select({ updatedAt: diagnosisCodings.updatedAt })
      .from(diagnosisCodings)
      .where(eq(diagnosisCodings.id, row.id));
    if (!existing || updatedAt > existing.updatedAt) {
      await tx
        .update(diagnosisCodings)
        .set({ isPrimary: false, deletedAt: updatedAt, updatedAt })
        .where(
          and(
            eq(diagnosisCodings.assessmentId, row.assessmentId),
            eq(diagnosisCodings.isPrimary, true),
            ne(diagnosisCodings.diagnosisId, row.diagnosisId),
            isNull(diagnosisCodings.deletedAt),
          ),
        );
    }
  }

  const [applied] = await tx
    .insert(diagnosisCodings)
    .values({
      id: row.id,
      updatedAt,
      deletedAt,
      assessmentId: row.assessmentId,
      diagnosisId: row.diagnosisId,
      icd10Code: row.icd10Code,
      isPrimary: row.isPrimary,
    })
    .onConflictDoUpdate({
      target: diagnosisCodings.id,
      set: {
        updatedAt: sql`excluded.updated_at`,
        // LWW (see answers above): a newer re-add revives; a stale edit is gated out.
        deletedAt: sql`excluded.deleted_at`,
        icd10Code: sql`excluded.icd10_code`,
        isPrimary: sql`excluded.is_primary`,
      },
      setWhere: sql`excluded.updated_at > ${diagnosisCodings.updatedAt}`,
    })
    .returning({ serverSeq: diagnosisCodings.serverSeq });
  if (applied) return { id: row.id, status: "applied", serverSeq: applied.serverSeq };
  return resolveSkipped(tx, diagnosisCodings, row.id, updatedAt);
}

export async function push(db: Db, rows: SyncPushRow[]): Promise<SyncPushResult[]> {
  return db.transaction(async (tx) => {
    const results: SyncPushResult[] = [];
    for (const row of rows) {
      try {
        // Savepoint per row: a collision or reject rolls back this row only, never the batch.
        results.push(await tx.transaction((sp) => pushRow(sp, row)));
      } catch (error) {
        const reason = error instanceof RejectedRow ? error.message : "conflict";
        results.push({ id: row.id, status: "rejected", reason });
      }
    }
    return results;
  });
}

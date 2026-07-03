import { and, eq, isNull, sql } from "drizzle-orm";
import { assessmentAnswers, assessments, type Db } from "@ohmyscribe/db";

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
  return { ...assessment, answers };
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

export async function completeAssessment(db: Db, assessmentId: string) {
  const now = new Date();
  await db
    .update(assessments)
    .set({ completedAt: now, updatedAt: now })
    .where(
      and(
        eq(assessments.id, assessmentId),
        isNull(assessments.deletedAt),
        isNull(assessments.completedAt),
      ),
    );
}

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  assessments,
  auditLogs,
  patients,
  qualityFlags,
  users,
  visits,
  type Db,
} from "@ohmyscribe/db";
import { reviewDiffSummary, type PdgmResult } from "@ohmyscribe/shared";
import { getAssessment } from "./assessments.ts";
import { getCodedDiagnoses } from "./diagnosis-codings.ts";
import { getVisit } from "./visits.ts";

// Approved items leave the queue; returned ones stay visible so outstanding
// returns can be tracked until the nurse refiles.
const QUEUE_REVIEW_STATUSES = ["pending_review", "returned"] as const;

export async function listReviewQueue(db: Db) {
  const rows = await db
    .select({
      assessmentId: assessments.id,
      visitId: visits.id,
      reviewStatus: assessments.reviewStatus,
      completedAt: assessments.completedAt,
      pdgmSnapshot: assessments.pdgmSnapshot,
      scheduledAt: visits.scheduledAt,
      patientName: patients.name,
      nurseName: users.name,
      // Correlated subquery: a join would multiply rows per flag.
      unresolvedFlagCount: sql<number>`(
        select count(*) from ${qualityFlags}
        where ${qualityFlags.assessmentId} = ${assessments.id}
          and ${qualityFlags.resolved} = false
          and ${qualityFlags.deletedAt} is null
      )`,
    })
    .from(assessments)
    .innerJoin(visits, eq(visits.id, assessments.visitId))
    .leftJoin(patients, and(eq(patients.id, visits.patientId), isNull(patients.deletedAt)))
    .leftJoin(users, and(eq(users.id, visits.assignedUserId), isNull(users.deletedAt)))
    .where(
      and(
        inArray(assessments.reviewStatus, [...QUEUE_REVIEW_STATUSES]),
        isNull(assessments.deletedAt),
      ),
    )
    .orderBy(sql`${assessments.completedAt} desc nulls last`);

  return Promise.all(
    rows.map(async (row) => {
      const [coded, assessment] = await Promise.all([
        getCodedDiagnoses(db, row.assessmentId),
        getAssessment(db, row.assessmentId),
      ]);
      const disagreements =
        coded && assessment
          ? reviewDiffSummary(coded, assessment.answers, assessment.suggestions).total
          : 0;
      return {
        assessmentId: row.assessmentId,
        visitId: row.visitId,
        reviewStatus: row.reviewStatus,
        patientName: row.patientName,
        nurseName: row.nurseName,
        visitDate: row.scheduledAt ?? row.completedAt,
        caseMixWeight: (row.pdgmSnapshot as PdgmResult | null)?.caseMixWeight ?? null,
        disagreements,
        unresolvedFlagCount: Number(row.unresolvedFlagCount),
      };
    }),
  );
}

export type ReviewQueueItem = Awaited<ReturnType<typeof listReviewQueue>>[number];

// Null when the assessment doesn't exist or was never filed (reviewStatus null =
// draft): drafts have nothing to compare yet, so no review page.
export async function getReviewDetail(db: Db, assessmentId: string) {
  const [assessmentRow] = await db
    .select({
      visitId: assessments.visitId,
      completedAt: assessments.completedAt,
      reviewStatus: assessments.reviewStatus,
    })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), isNull(assessments.deletedAt)));
  if (!assessmentRow?.reviewStatus) return null;

  const [visit, coded, assessment, flags] = await Promise.all([
    getVisit(db, assessmentRow.visitId),
    getCodedDiagnoses(db, assessmentId),
    getAssessment(db, assessmentId),
    db
      .select({
        id: qualityFlags.id,
        ruleId: qualityFlags.ruleId,
        itemCode: qualityFlags.itemCode,
        kind: qualityFlags.kind,
        message: qualityFlags.message,
        resolved: qualityFlags.resolved,
      })
      .from(qualityFlags)
      .where(and(eq(qualityFlags.assessmentId, assessmentId), isNull(qualityFlags.deletedAt))),
  ]);
  if (!visit || !coded || !assessment) return null;

  const [nurse] = visit.assignedUserId
    ? await db
        .select({ name: users.name })
        .from(users)
        .where(and(eq(users.id, visit.assignedUserId), isNull(users.deletedAt)))
    : [];

  return {
    assessmentId,
    reviewStatus: assessmentRow.reviewStatus,
    completedAt: assessmentRow.completedAt,
    visit,
    nurseName: nurse?.name ?? null,
    coded,
    answers: assessment.answers,
    suggestions: assessment.suggestions,
    pdgmSnapshot: assessment.pdgmSnapshot,
    flags,
  };
}

export type ReviewDetail = NonNullable<Awaited<ReturnType<typeof getReviewDetail>>>;

export async function listReviewers(db: Db): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.role, "reviewer"), isNull(users.deletedAt)));
}

export async function findReviewer(db: Db, userId: string): Promise<string | null> {
  const [reviewer] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, "reviewer"), isNull(users.deletedAt)));
  return reviewer?.id ?? null;
}

type ReviewActionResult = { ok: true } | { ok: false; reason: "not_filed" };

export async function approveAssessment(
  db: Db,
  assessmentId: string,
  actorId: string,
): Promise<ReviewActionResult> {
  return db.transaction(async (tx) => {
    const [assessment] = await tx
      .select({ completedAt: assessments.completedAt })
      .from(assessments)
      .where(and(eq(assessments.id, assessmentId), isNull(assessments.deletedAt)));

    if (!assessment?.completedAt) return { ok: false, reason: "not_filed" };

    await tx
      .update(assessments)
      .set({ reviewStatus: "approved", updatedAt: new Date() })
      .where(eq(assessments.id, assessmentId));

    await tx.insert(auditLogs).values({ assessmentId, event: "accepted", actorId });

    return { ok: true };
  });
}

export type ReturnFlag = {
  itemCode: string | null;
  kind: "nurse_vs_ai" | "missing";
  message: string;
};

export async function returnAssessment(
  db: Db,
  assessmentId: string,
  flags: ReturnFlag[],
): Promise<ReviewActionResult> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [assessment] = await tx
      .select({ visitId: assessments.visitId, completedAt: assessments.completedAt })
      .from(assessments)
      .where(and(eq(assessments.id, assessmentId), isNull(assessments.deletedAt)));

    if (!assessment?.completedAt) return { ok: false, reason: "not_filed" };

    for (const flag of flags) {
      await tx
        .insert(qualityFlags)
        .values({
          assessmentId,
          ruleId: flag.itemCode ? `review:${flag.itemCode}` : "review:general",
          itemCode: flag.itemCode,
          kind: flag.kind,
          message: flag.message,
          resolved: false,
          updatedAt: now,
        })
        // Re-returning the same item refreshes the one flag instead of erroring.
        .onConflictDoUpdate({
          target: [qualityFlags.assessmentId, qualityFlags.ruleId],
          set: {
            itemCode: flag.itemCode,
            kind: flag.kind,
            message: flag.message,
            resolved: false,
            updatedAt: now,
          },
        });
    }

    // Clearing completedAt is the reopen: the server 409 guards and the device
    // read-only gate both key off it. The PDGM snapshot stays; refiling overwrites it.
    await tx
      .update(assessments)
      .set({ reviewStatus: "returned", completedAt: null, updatedAt: now })
      .where(eq(assessments.id, assessmentId));

    await tx.update(visits).set({ status: "open" }).where(eq(visits.id, assessment.visitId));

    return { ok: true };
  });
}

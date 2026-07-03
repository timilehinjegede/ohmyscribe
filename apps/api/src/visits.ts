import { and, count, desc, eq, isNull } from "drizzle-orm";
import {
  assessmentAnswers,
  assessments,
  diagnoses,
  patients,
  visits,
  type Db,
} from "@ohmyscribe/db";

// Explicit projections so internal sync columns and externalId don't leak into
// the API response.
const visitFields = {
  id: visits.id,
  patientId: visits.patientId,
  assignedUserId: visits.assignedUserId,
  type: visits.type,
  status: visits.status,
  scheduledAt: visits.scheduledAt,
};

const patientFields = {
  id: patients.id,
  name: patients.name,
  dob: patients.dob,
  address: patients.address,
  referringPhysician: patients.referringPhysician,
};

const diagnosisFields = {
  id: diagnoses.id,
  system: diagnoses.system,
  code: diagnoses.code,
  display: diagnoses.display,
};

// Kept as a data-access function (not inline in the route) so the sync layer
// can reuse it.
export async function getVisit(db: Db, id: string) {
  const [visit] = await db
    .select(visitFields)
    .from(visits)
    .where(and(eq(visits.id, id), isNull(visits.deletedAt)));
  if (!visit) return null;

  // Independent lookups — safe to run in parallel.
  const [patientRows, problemList, assessmentRows] = await Promise.all([
    db
      .select(patientFields)
      .from(patients)
      .where(and(eq(patients.id, visit.patientId), isNull(patients.deletedAt))),
    db
      .select(diagnosisFields)
      .from(diagnoses)
      .where(and(eq(diagnoses.visitId, id), isNull(diagnoses.deletedAt))),
    db
      .select({
        id: assessments.id,
        completedAt: assessments.completedAt,
        answeredCount: count(assessmentAnswers.id),
      })
      .from(assessments)
      .leftJoin(
        assessmentAnswers,
        and(
          eq(assessmentAnswers.assessmentId, assessments.id),
          isNull(assessmentAnswers.deletedAt),
        ),
      )
      .where(and(eq(assessments.visitId, id), isNull(assessments.deletedAt)))
      .groupBy(assessments.id),
  ]);

  const summary = assessmentRows[0];
  const assessment = summary
    ? {
        id: summary.id,
        answeredCount: Number(summary.answeredCount),
        completedAt: summary.completedAt,
      }
    : null;

  return { ...visit, patient: patientRows[0] ?? null, diagnoses: problemList, assessment };
}

export async function listVisits(db: Db) {
  // The deletedAt check is in the ON clause, not WHERE: a soft-deleted patient leaves
  // a null name instead of dropping the visit, this keeps the list consistent with getVisit.
  return db
    .select({ ...visitFields, patientName: patients.name })
    .from(visits)
    .leftJoin(patients, and(eq(visits.patientId, patients.id), isNull(patients.deletedAt)))
    .where(isNull(visits.deletedAt))
    .orderBy(desc(visits.createdAt));
}

import { and, eq, isNull } from "drizzle-orm";
import { diagnoses, patients, visits, type Db } from "@ohmyscribe/db";

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
  const [patientRows, problemList] = await Promise.all([
    db
      .select(patientFields)
      .from(patients)
      .where(and(eq(patients.id, visit.patientId), isNull(patients.deletedAt))),
    db
      .select(diagnosisFields)
      .from(diagnoses)
      .where(and(eq(diagnoses.visitId, id), isNull(diagnoses.deletedAt))),
  ]);

  return { ...visit, patient: patientRows[0] ?? null, diagnoses: problemList };
}

export async function listVisits(db: Db) {
  return db.select(visitFields).from(visits).where(isNull(visits.deletedAt));
}

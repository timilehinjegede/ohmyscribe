import type { AssessmentRow, PatientRow, VisitRow } from "@/db/rows";
import { localRows, unsyncedRows } from "@/db/sqlite";

export type SyncVisitGroup = {
  visitId: string;
  patientName: string;
  pending: number;
  failed: number;
};

// The unsynced local edits grouped by the visit they belong to.
export async function localSyncStatus(): Promise<{
  groups: SyncVisitGroup[];
  pending: number;
  failed: number;
}> {
  const rows = await unsyncedRows();
  const [assessments, visits, patients] = await Promise.all([
    localRows<AssessmentRow>("assessments"),
    localRows<VisitRow>("visits"),
    localRows<PatientRow>("patients"),
  ]);
  const visitByAssessment = new Map(assessments.map((row) => [row.id, row.visitId]));
  const patientByVisit = new Map(visits.map((row) => [row.id, row.patientId]));
  const nameByPatient = new Map(patients.map((row) => [row.id, row.name]));

  const byVisit = new Map<string, { pending: number; failed: number }>();
  let pending = 0;
  let failed = 0;
  for (const row of rows) {
    const visitId = visitByAssessment.get(row.data.assessmentId as string);
    if (!visitId) continue;
    const group = byVisit.get(visitId) ?? { pending: 0, failed: 0 };
    if (row.syncStatus === "error") {
      group.failed += 1;
      failed += 1;
    } else {
      group.pending += 1;
      pending += 1;
    }
    byVisit.set(visitId, group);
  }

  const groups = [...byVisit.entries()].map(([visitId, counts]) => ({
    visitId,
    patientName: nameByPatient.get(patientByVisit.get(visitId) ?? "") ?? "Unknown patient",
    ...counts,
  }));
  return { groups, pending, failed };
}

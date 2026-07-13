import { extractionsForSync } from "@/db/extractions";
import type { AssessmentRow, PatientRow, VisitRow } from "@/db/rows";
import { localRows, unsyncedRows } from "@/db/sqlite";

export type SyncVisitGroup = {
  visitId: string;
  patientName: string;
  pending: number;
  failed: number;
  recordingsQueued: number;
  recordingsFailed: number;
  recordingAssessmentId: string | null;
};

const emptyGroupCounts = () => ({
  pending: 0,
  failed: 0,
  recordingsQueued: 0,
  recordingsFailed: 0,
  recordingAssessmentId: null as string | null,
});

// The unsynced local edits and queued recordings grouped by the visit they belong to.
export async function localSyncStatus(): Promise<{
  groups: SyncVisitGroup[];
  pending: number;
  failed: number;
  recordings: { queued: number; failed: number };
}> {
  const rows = await unsyncedRows();
  const extractions = await extractionsForSync();
  const [assessments, visits, patients] = await Promise.all([
    localRows<AssessmentRow>("assessments"),
    localRows<VisitRow>("visits"),
    localRows<PatientRow>("patients"),
  ]);
  const visitByAssessment = new Map(assessments.map((row) => [row.id, row.visitId]));
  const patientByVisit = new Map(visits.map((row) => [row.id, row.patientId]));
  const nameByPatient = new Map(patients.map((row) => [row.id, row.name]));

  const byVisit = new Map<string, ReturnType<typeof emptyGroupCounts>>();
  let pending = 0;
  let failed = 0;
  for (const row of rows) {
    const visitId = visitByAssessment.get(row.data.assessmentId as string);
    if (!visitId) continue;
    const group = byVisit.get(visitId) ?? emptyGroupCounts();
    if (row.syncStatus === "error") {
      group.failed += 1;
      failed += 1;
    } else {
      group.pending += 1;
      pending += 1;
    }
    byVisit.set(visitId, group);
  }

  const recordings = { queued: 0, failed: 0 };
  for (const extraction of extractions) {
    const visitId = visitByAssessment.get(extraction.assessmentId);
    if (!visitId) continue;
    const group = byVisit.get(visitId) ?? emptyGroupCounts();
    if (extraction.status === "failed") {
      group.recordingsFailed += 1;
      recordings.failed += 1;
    } else {
      group.recordingsQueued += 1;
      recordings.queued += 1;
    }
    group.recordingAssessmentId = extraction.assessmentId;
    byVisit.set(visitId, group);
  }

  const groups = [...byVisit.entries()].map(([visitId, counts]) => ({
    visitId,
    patientName: nameByPatient.get(patientByVisit.get(visitId) ?? "") ?? "Unknown patient",
    ...counts,
  }));
  return { groups, pending, failed, recordings };
}

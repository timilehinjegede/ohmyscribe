import {
  deleteAsync,
  documentDirectory,
  makeDirectoryAsync,
  moveAsync,
} from "expo-file-system/legacy";
import { nextStatusAfterFailure, type PendingExtractionStatus } from "@ohmyscribe/shared";

import { db } from "@/db/sqlite";

export type PendingExtraction = {
  assessmentId: string;
  fileUri: string;
  status: PendingExtractionStatus;
  attempts: number;
  recordedAt: string;
};

type PendingExtractionRow = {
  assessment_id: string;
  file_uri: string;
  status: PendingExtractionStatus;
  attempts: number;
  recorded_at: string;
};

const pendingAudioDirectory = `${documentDirectory}pending-audio/`;

const toPendingExtraction = (row: PendingExtractionRow): PendingExtraction => ({
  assessmentId: row.assessment_id,
  fileUri: row.file_uri,
  status: row.status,
  attempts: row.attempts,
  recordedAt: row.recorded_at,
});

// Move the recording out of the recorder's temp cache into an app-owned directory so it survives
// until upload. Filenames are unique per recording so a re-record never clobbers a file that may
// still be mid-upload; the superseded file is deleted here instead.
export async function enqueueExtraction(
  assessmentId: string,
  sourceUri: string,
  recordedAt: string,
): Promise<void> {
  await makeDirectoryAsync(pendingAudioDirectory, { intermediates: true });
  const destinationUri = `${pendingAudioDirectory}${assessmentId}-${Date.now()}.m4a`;
  const existing = await getExtraction(assessmentId);
  if (existing && existing.fileUri !== destinationUri) {
    await deleteAsync(existing.fileUri, { idempotent: true });
  }
  await moveAsync({ from: sourceUri, to: destinationUri });
  await db.runAsync(
    `INSERT INTO pending_extractions (assessment_id, file_uri, status, attempts, recorded_at)
       VALUES (?, ?, 'queued', 0, ?)
     ON CONFLICT(assessment_id) DO UPDATE SET
       file_uri = excluded.file_uri, status = 'queued', attempts = 0,
       recorded_at = excluded.recorded_at`,
    assessmentId,
    destinationUri,
    recordedAt,
  );
}

export async function getExtraction(assessmentId: string): Promise<PendingExtraction | null> {
  const row = await db.getFirstAsync<PendingExtractionRow>(
    `SELECT * FROM pending_extractions WHERE assessment_id = ?`,
    assessmentId,
  );
  return row ? toPendingExtraction(row) : null;
}

export async function claimQueuedExtractions(): Promise<PendingExtraction[]> {
  const rows = await db.getAllAsync<PendingExtractionRow>(
    `SELECT * FROM pending_extractions WHERE status = 'queued'`,
  );
  return rows.map(toPendingExtraction);
}

// Atomic claim: only one caller can flip queued -> uploading, so overlapping drains skip the row.
export async function markExtractionUploading(assessmentId: string): Promise<boolean> {
  const result = await db.runAsync(
    `UPDATE pending_extractions SET status = 'uploading' WHERE assessment_id = ? AND status = 'queued'`,
    assessmentId,
  );
  return result.changes > 0;
}

// Network throw (offline/timeout): back to queued without burning an attempt.
export async function requeueExtraction(assessmentId: string): Promise<void> {
  await db.runAsync(
    `UPDATE pending_extractions SET status = 'queued' WHERE assessment_id = ? AND status = 'uploading'`,
    assessmentId,
  );
}

// Terminal for both a successful upload and a 409 skip: the recording is no longer needed.
export async function completeExtraction(assessmentId: string): Promise<void> {
  const existing = await getExtraction(assessmentId);
  if (existing) await deleteAsync(existing.fileUri, { idempotent: true });
  await db.runAsync(`DELETE FROM pending_extractions WHERE assessment_id = ?`, assessmentId);
}

export async function failExtraction(assessmentId: string): Promise<void> {
  const existing = await getExtraction(assessmentId);
  if (!existing) return;
  const { attempts, status } = nextStatusAfterFailure(existing.attempts);
  await db.runAsync(
    `UPDATE pending_extractions SET attempts = ?, status = ? WHERE assessment_id = ?`,
    attempts,
    status,
    assessmentId,
  );
}

// Manual retry grants a fresh set of attempts.
export async function retryExtraction(assessmentId: string): Promise<void> {
  await db.runAsync(
    `UPDATE pending_extractions SET status = 'queued', attempts = 0
       WHERE assessment_id = ? AND status = 'failed'`,
    assessmentId,
  );
}

// A row still 'uploading' when a drain starts is an orphan from a killed session — the drain
// latch means nothing else can be mid-upload. Requeue without burning an attempt.
export async function requeueStrandedUploads(): Promise<void> {
  await db.runAsync(`UPDATE pending_extractions SET status = 'queued' WHERE status = 'uploading'`);
}

export async function extractionsForSync(): Promise<
  { assessmentId: string; status: PendingExtractionStatus }[]
> {
  const rows = await db.getAllAsync<{ assessment_id: string; status: PendingExtractionStatus }>(
    `SELECT assessment_id, status FROM pending_extractions
       WHERE status IN ('queued', 'uploading', 'failed')`,
  );
  return rows.map((row) => ({ assessmentId: row.assessment_id, status: row.status }));
}

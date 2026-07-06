import { z } from "zod";

// Client-authored tables the nurse edits offline and pushes up. Pull-only tables
// (visits, patients, diagnoses, suggestions) are never accepted here and our schema
// forbids pushing them.
export const CLIENT_AUTHORED_TABLES = ["assessment_answers", "diagnosis_codings"] as const;
export type ClientAuthoredTable = (typeof CLIENT_AUTHORED_TABLES)[number];

// Every pushed row carries the sync trio: the device-generated id (idempotent upsert
// key), the device-clock updatedAt (LWW tiebreak), and a nullable deletedAt tombstone.
const syncFields = {
  id: z.string().uuid(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
};

export const pushAnswerRow = z.object({
  table: z.literal("assessment_answers"),
  ...syncFields,
  assessmentId: z.string().uuid(),
  itemCode: z.string(),
  value: z.string(),
});

export const pushCodingRow = z.object({
  table: z.literal("diagnosis_codings"),
  ...syncFields,
  assessmentId: z.string().uuid(),
  diagnosisId: z.string().uuid(),
  icd10Code: z.string(),
  isPrimary: z.boolean(),
});

export const syncPushRow = z.discriminatedUnion("table", [pushAnswerRow, pushCodingRow]);
export type SyncPushRow = z.infer<typeof syncPushRow>;

export const syncPushRequestSchema = z.object({ rows: z.array(syncPushRow) });

export const syncPullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
});

// applied → the server took this exact version (serverSeq is its new cursor value; also returned
//   for an idempotent re-push of a version already stored, so the client can complete its ack);
// stale → the server already had a strictly newer version, so this write was a no-op;
// rejected → the row was refused (bad reference or a conflict) and rolled back on its own.
export type SyncPushResult =
  | { id: string; status: "applied"; serverSeq: number }
  | { id: string; status: "stale" }
  | { id: string; status: "rejected"; reason: string };

export type SyncPushResponse = { results: SyncPushResult[] };

export type SyncPullResponse = { changes: Record<string, unknown[]>; cursor: number };

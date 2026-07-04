import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { clientUpdatedAt, syncColumns } from "./columns.ts";
import { assessments } from "./assessments.ts";
import { diagnoses } from "./diagnoses.ts";
import { users } from "./users.ts";

// Client-authored coding layered on the pull-only diagnoses table.
// Primacy is per-assessment (SOC vs recert can differ), so isPrimary is
// a flag on this assessment-scoped row rather than on the diagnosis.
export const diagnosisCodings = pgTable(
  "diagnosis_codings",
  {
    ...syncColumns,
    updatedAt: clientUpdatedAt(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id),
    diagnosisId: uuid("diagnosis_id")
      .notNull()
      .references(() => diagnoses.id),
    icd10Code: text("icd10_code").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    codedById: uuid("coded_by_id").references(() => users.id),
  },
  (t) => [
    index("diagnosis_codings_server_seq_idx").on(t.serverSeq),
    index("diagnosis_codings_assessment_id_idx").on(t.assessmentId),
    unique("diagnosis_codings_assessment_diagnosis_unique").on(t.assessmentId, t.diagnosisId),
    // At most one primary per assessment. Partial so a soft-deleted coding doesn't hold
    // the slot; a primary swap must unset the previous one in the same transaction.
    uniqueIndex("diagnosis_codings_one_primary_idx")
      .on(t.assessmentId)
      .where(sql`is_primary and deleted_at is null`),
  ],
);

export type DiagnosisCoding = typeof diagnosisCodings.$inferSelect;
export type NewDiagnosisCoding = typeof diagnosisCodings.$inferInsert;

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  real,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { syncColumns } from "./columns.ts";
import { assessments } from "./assessments.ts";
import { diagnoses } from "./diagnoses.ts";

// Pull-only, AI-authored: the AI's recommended role (primary vs secondary) per referral diagnosis.
// No code column — the crosswalk supplies that, so this row carries only the judgment.
export const diagnosisSuggestions = pgTable(
  "diagnosis_suggestions",
  {
    ...syncColumns,
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id),
    diagnosisId: uuid("diagnosis_id")
      .notNull()
      .references(() => diagnoses.id),
    isPrimary: boolean("is_primary").notNull(),
    rationale: text("rationale"),
    confidence: real("confidence"),
  },
  (t) => [
    index("diagnosis_suggestions_server_seq_idx").on(t.serverSeq),
    index("diagnosis_suggestions_assessment_id_idx").on(t.assessmentId),
    unique("diagnosis_suggestions_assessment_diagnosis_unique").on(t.assessmentId, t.diagnosisId),
    uniqueIndex("diagnosis_suggestions_one_primary_idx")
      .on(t.assessmentId)
      .where(sql`is_primary and deleted_at is null`),
  ],
);

export type DiagnosisSuggestion = typeof diagnosisSuggestions.$inferSelect;
export type NewDiagnosisSuggestion = typeof diagnosisSuggestions.$inferInsert;

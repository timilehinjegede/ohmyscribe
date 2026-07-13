import { index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { syncColumns } from "./columns.ts";
import { assessments } from "./assessments.ts";

// Full visit transcript from the audio extraction pipeline. Pull-only; one per
// assessment, re-extraction replaces the text in place.
export const assessmentTranscripts = pgTable(
  "assessment_transcripts",
  {
    ...syncColumns,
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id),
    text: text("text").notNull(),
  },
  (t) => [
    index("assessment_transcripts_server_seq_idx").on(t.serverSeq),
    index("assessment_transcripts_assessment_id_idx").on(t.assessmentId),
    unique("assessment_transcripts_assessment_id_unique").on(t.assessmentId),
  ],
);

export type AssessmentTranscript = typeof assessmentTranscripts.$inferSelect;
export type NewAssessmentTranscript = typeof assessmentTranscripts.$inferInsert;

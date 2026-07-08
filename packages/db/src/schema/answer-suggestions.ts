import { index, integer, pgTable, real, text, uuid } from "drizzle-orm/pg-core";
import { syncColumns } from "./columns.ts";
import { answerSuggestionSource, answerSuggestionStatus } from "./enums.ts";
import { assessments } from "./assessments.ts";

// AI draft answers for OASIS items, from the transcript /extract pipeline (audio-sourced).
// Pull-only; status is derived from the latest audit_logs event for the item.
export const answerSuggestions = pgTable(
  "answer_suggestions",
  {
    ...syncColumns,
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id),
    itemCode: text("item_code").notNull(),
    suggestedValue: text("suggested_value"),
    rationale: text("rationale"),
    transcriptSnippet: text("transcript_snippet"),
    snippetStart: integer("snippet_start"),
    snippetEnd: integer("snippet_end"),
    confidence: real("confidence"),
    status: answerSuggestionStatus("status").notNull().default("pending"),
    source: answerSuggestionSource("source").notNull().default("audio"),
  },
  (t) => [
    index("answer_suggestions_server_seq_idx").on(t.serverSeq),
    index("answer_suggestions_assessment_id_idx").on(t.assessmentId),
  ],
);

export type AnswerSuggestion = typeof answerSuggestions.$inferSelect;
export type NewAnswerSuggestion = typeof answerSuggestions.$inferInsert;

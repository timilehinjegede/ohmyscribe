import { index, pgTable, real, text, uuid } from "drizzle-orm/pg-core";
import { syncColumns } from "./columns.ts";
import { suggestionSource, suggestionStatus } from "./enums.ts";
import { assessments } from "./assessments.ts";

// AI draft answers from /extract. Pull-only; status is derived from the latest
// audit_logs event for the item.
export const suggestions = pgTable(
  "suggestions",
  {
    ...syncColumns,
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id),
    itemCode: text("item_code").notNull(),
    suggestedValue: text("suggested_value"),
    rationale: text("rationale"),
    transcriptSnippet: text("transcript_snippet"),
    confidence: real("confidence"),
    status: suggestionStatus("status").notNull().default("pending"),
    source: suggestionSource("source").notNull().default("audio"),
  },
  (t) => [
    index("suggestions_server_seq_idx").on(t.serverSeq),
    index("suggestions_assessment_id_idx").on(t.assessmentId),
  ],
);

export type Suggestion = typeof suggestions.$inferSelect;
export type NewSuggestion = typeof suggestions.$inferInsert;

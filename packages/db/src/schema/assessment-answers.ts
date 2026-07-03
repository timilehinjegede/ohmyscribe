import { index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { clientUpdatedAt, syncColumns } from "./columns.ts";
import { assessments } from "./assessments.ts";
import { users } from "./users.ts";

export const assessmentAnswers = pgTable(
  "assessment_answers",
  {
    ...syncColumns,
    updatedAt: clientUpdatedAt(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id),
    itemCode: text("item_code").notNull(),
    value: text("value").notNull(),
    enteredById: uuid("entered_by_id").references(() => users.id),
  },
  (t) => [
    index("assessment_answers_server_seq_idx").on(t.serverSeq),
    index("assessment_answers_assessment_id_idx").on(t.assessmentId),
    unique("assessment_answers_assessment_item_unique").on(t.assessmentId, t.itemCode),
  ],
);

export type AssessmentAnswer = typeof assessmentAnswers.$inferSelect;
export type NewAssessmentAnswer = typeof assessmentAnswers.$inferInsert;

import { boolean, index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { syncColumns } from "./columns.ts";
import { qualityFlagKind } from "./enums.ts";
import { assessments } from "./assessments.ts";

export const qualityFlags = pgTable(
  "quality_flags",
  {
    ...syncColumns,
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id),
    ruleId: text("rule_id").notNull(),
    itemCode: text("item_code"),
    kind: qualityFlagKind("kind").notNull(),
    message: text("message").notNull(),
    resolved: boolean("resolved").notNull().default(false),
  },
  (t) => [
    index("quality_flags_server_seq_idx").on(t.serverSeq),
    index("quality_flags_assessment_id_idx").on(t.assessmentId),
    unique("quality_flags_assessment_rule_unique").on(t.assessmentId, t.ruleId),
  ],
);

export type QualityFlag = typeof qualityFlags.$inferSelect;
export type NewQualityFlag = typeof qualityFlags.$inferInsert;

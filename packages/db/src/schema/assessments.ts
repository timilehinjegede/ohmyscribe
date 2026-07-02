import { index, pgTable, uuid } from "drizzle-orm/pg-core";
import { clientUpdatedAt, syncColumns } from "./columns.ts";
import { visits } from "./visits.ts";

export const assessments = pgTable(
  "assessments",
  {
    ...syncColumns,
    updatedAt: clientUpdatedAt(),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id),
  },
  (t) => [
    index("assessments_server_seq_idx").on(t.serverSeq),
    index("assessments_visit_id_idx").on(t.visitId),
  ],
);

export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;

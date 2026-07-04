import { index, jsonb, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
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
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    pdgmSnapshot: jsonb("pdgm_snapshot"),
  },
  (t) => [
    index("assessments_server_seq_idx").on(t.serverSeq),
    unique("assessments_visit_id_unique").on(t.visitId),
  ],
);

export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;

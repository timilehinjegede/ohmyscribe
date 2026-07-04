import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { syncColumns } from "./columns.ts";
import { visits } from "./visits.ts";

// A visit's problem list, extracted from the referral that created the visit.
// Pull-only, server-authored by ingestion.
export const diagnoses = pgTable(
  "diagnoses",
  {
    ...syncColumns,
    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id),
    system: text("system").notNull(),
    code: text("code").notNull(),
    display: text("display"),
    // Condition.onsetDateTime — the ranking signal for primary-diagnosis suggestions
    // (nullable: not all conditions carry it).
    onset: timestamp("onset", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("diagnoses_server_seq_idx").on(t.serverSeq),
    index("diagnoses_visit_id_idx").on(t.visitId),
    unique("diagnoses_visit_code_unique").on(t.visitId, t.system, t.code),
  ],
);

export type Diagnosis = typeof diagnoses.$inferSelect;
export type NewDiagnosis = typeof diagnoses.$inferInsert;

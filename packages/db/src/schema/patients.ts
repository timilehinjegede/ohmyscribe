import { date, index, pgTable, text } from "drizzle-orm/pg-core";
import { syncColumns } from "./columns.ts";

export const patients = pgTable(
  "patients",
  {
    ...syncColumns,
    // source-system patient id; upsert key so a re-referral reuses the patient
    externalId: text("external_id").unique(),
    name: text("name").notNull(),
    dob: date("dob"),
    address: text("address"),
    referringPhysician: text("referring_physician"),
    source: text("source").notNull().default("synthea"),
  },
  (t) => [index("patients_server_seq_idx").on(t.serverSeq)],
);

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;

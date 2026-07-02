import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { syncColumns } from "./columns.ts";
import { visitStatus, visitType } from "./enums.ts";
import { patients } from "./patients.ts";
import { users } from "./users.ts";

export const visits = pgTable(
  "visits",
  {
    ...syncColumns,
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    assignedUserId: uuid("assigned_user_id").references(() => users.id),
    type: visitType("type").notNull(),
    scheduledAt: timestamp("scheduled_at", {
      withTimezone: true,
      mode: "date",
    }),
    status: visitStatus("status").notNull().default("open"),
  },
  (t) => [
    index("visits_server_seq_idx").on(t.serverSeq),
    index("visits_patient_id_idx").on(t.patientId),
    index("visits_assigned_user_id_idx").on(t.assignedUserId),
  ],
);

export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { referralStatus } from "./enums.ts";
import { patients } from "./patients.ts";

// Ingestion landing table. Server-only (never syncs). A malformed referral is
// stored as 'rejected' with errorReason and creates no patient.
export const rawReferrals = pgTable(
  "raw_referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawPayload: jsonb("raw_payload").notNull(),
    status: referralStatus("status").notNull(),
    errorReason: text("error_reason"),
    patientId: uuid("patient_id").references(() => patients.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("raw_referrals_status_idx").on(t.status)],
);

export type RawReferral = typeof rawReferrals.$inferSelect;
export type NewRawReferral = typeof rawReferrals.$inferInsert;

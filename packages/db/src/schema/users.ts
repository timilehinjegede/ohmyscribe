import { index, pgTable, text } from "drizzle-orm/pg-core";
import { syncColumns } from "./columns.ts";
import { userRole } from "./enums.ts";

// Clinicians. Pull-only reference data; seeded (no auth).
export const users = pgTable(
  "users",
  {
    ...syncColumns,
    name: text("name").notNull(),
    role: userRole("role").notNull(),
  },
  (t) => [index("users_server_seq_idx").on(t.serverSeq)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

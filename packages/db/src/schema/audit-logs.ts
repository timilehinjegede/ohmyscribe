import { sql } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditEvent } from "./enums.ts";
import { assessments } from "./assessments.ts";
import { users } from "./users.ts";

// Append-only: rows are never updated or deleted, hence no updatedAt/deletedAt.
// actorId is null for AI/system events.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serverSeq: bigint("server_seq", { mode: "number" })
      .default(sql`nextval('sync_seq')`)
      .notNull(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id),
    itemCode: text("item_code"),
    event: auditEvent("event").notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_logs_server_seq_idx").on(t.serverSeq),
    index("audit_logs_assessment_id_idx").on(t.assessmentId),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

import { sql } from "drizzle-orm";
import { bigint, pgSequence, timestamp, uuid } from "drizzle-orm/pg-core";

// Server-assigned monotonic revision; used as the sync pull cursor.
export const syncSeq = pgSequence("sync_seq");

// Shared columns for syncable tables. serverSeq is set on INSERT by the default
// and reassigned on UPDATE by the set_server_seq trigger (a column default fires
// only on insert). updatedAt defaults to now() here, which suits server-authored
// tables; client-authored tables override it with clientUpdatedAt below.
export const syncColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  serverSeq: bigint("server_seq", { mode: "number" }) // number safe to 2^53
    .default(sql`nextval('sync_seq')`)
    .notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
};

// No default, so the push handler must supply the device clock (the conflict
// tiebreak) instead of silently getting server now().
export const clientUpdatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull();

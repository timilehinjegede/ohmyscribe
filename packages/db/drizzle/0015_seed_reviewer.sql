-- Kept separate from the migration that adds the 'reviewer' enum value: Postgres
-- forbids using a new enum value inside the transaction that added it (unless the
-- type itself was created in that transaction, as on a fresh database).
INSERT INTO "users" ("id", "name", "role") VALUES ('00000000-0000-0000-0000-0000000000aa', 'QA Reviewer', 'reviewer') ON CONFLICT ("id") DO NOTHING;

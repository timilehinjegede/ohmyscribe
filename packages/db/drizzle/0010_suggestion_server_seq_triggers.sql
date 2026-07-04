-- answer_suggestions and diagnosis_suggestions are syncable, so their server_seq must be
-- reassigned on UPDATE like the other syncable tables. set_server_seq() exists (migration 0001).
CREATE TRIGGER answer_suggestions_set_server_seq BEFORE UPDATE ON "answer_suggestions" FOR EACH ROW EXECUTE FUNCTION set_server_seq();
--> statement-breakpoint
CREATE TRIGGER diagnosis_suggestions_set_server_seq BEFORE UPDATE ON "diagnosis_suggestions" FOR EACH ROW EXECUTE FUNCTION set_server_seq();

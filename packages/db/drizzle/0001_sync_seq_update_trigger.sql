-- Reassign server_seq on every UPDATE so an edited row's revision advances past
-- every pull cursor other devices have already passed. A column default fires
-- only on INSERT, so UPDATEs need this trigger.
CREATE OR REPLACE FUNCTION set_server_seq() RETURNS trigger AS $$
BEGIN
	NEW.server_seq := nextval('sync_seq');
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER users_set_server_seq BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION set_server_seq();
--> statement-breakpoint
CREATE TRIGGER patients_set_server_seq BEFORE UPDATE ON "patients" FOR EACH ROW EXECUTE FUNCTION set_server_seq();
--> statement-breakpoint
CREATE TRIGGER visits_set_server_seq BEFORE UPDATE ON "visits" FOR EACH ROW EXECUTE FUNCTION set_server_seq();
--> statement-breakpoint
CREATE TRIGGER assessments_set_server_seq BEFORE UPDATE ON "assessments" FOR EACH ROW EXECUTE FUNCTION set_server_seq();
--> statement-breakpoint
CREATE TRIGGER assessment_answers_set_server_seq BEFORE UPDATE ON "assessment_answers" FOR EACH ROW EXECUTE FUNCTION set_server_seq();
--> statement-breakpoint
CREATE TRIGGER suggestions_set_server_seq BEFORE UPDATE ON "suggestions" FOR EACH ROW EXECUTE FUNCTION set_server_seq();
--> statement-breakpoint
CREATE TRIGGER quality_flags_set_server_seq BEFORE UPDATE ON "quality_flags" FOR EACH ROW EXECUTE FUNCTION set_server_seq();
--> statement-breakpoint
-- audit_logs is append-only so this never fires in practice; kept for uniformity
-- so the invariant holds even if a row is ever updated.
CREATE TRIGGER audit_logs_set_server_seq BEFORE UPDATE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION set_server_seq();

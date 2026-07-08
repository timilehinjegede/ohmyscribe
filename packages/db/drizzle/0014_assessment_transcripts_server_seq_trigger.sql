-- assessment_transcripts is syncable, so its server_seq must be reassigned on UPDATE like the
-- other syncable tables. The set_server_seq() function already exists (migration 0001).
CREATE TRIGGER assessment_transcripts_set_server_seq BEFORE UPDATE ON "assessment_transcripts" FOR EACH ROW EXECUTE FUNCTION set_server_seq();

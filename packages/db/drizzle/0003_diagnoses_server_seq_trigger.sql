-- diagnoses is syncable, so its server_seq must be reassigned on UPDATE like
-- the other syncable tables. The set_server_seq() function already exists.
CREATE TRIGGER diagnoses_set_server_seq BEFORE UPDATE ON "diagnoses" FOR EACH ROW EXECUTE FUNCTION set_server_seq();

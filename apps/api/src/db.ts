import { createDb } from "@ohmyscribe/db";

// One pool for the process — createDb opens a connection pool, so it must not be
// called per request. The API holds this instance for its lifetime.
export const db = createDb();

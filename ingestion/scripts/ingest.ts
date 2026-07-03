import { createDb, type Db } from "@ohmyscribe/db";
import { ingestReferral } from "../src/index.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: bun run scripts/ingest.ts <referral-bundle.json>");
  process.exit(1);
}

let bundle: unknown;
try {
  bundle = await Bun.file(path).json();
} catch (err) {
  const reason = err instanceof Error ? err.message : String(err);
  console.error(`could not read/parse ${path}: ${reason}`);
  process.exit(1);
}

let db: Db | undefined;
try {
  db = createDb();
  console.log(JSON.stringify(await ingestReferral(bundle, db), null, 2));
} catch (err) {
  console.error(
    `ingest failed: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exitCode = 1;
} finally {
  await db?.$client.end();
}

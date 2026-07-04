import { mkdir, access, readFile, rename, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { watch } from "chokidar";
import { createDb, type Db } from "@ohmyscribe/db";
import { ingestReferral, type IngestionResult } from "./ingest-referral.ts";

// A dropped file's fate. It's the core IngestionResult, plus the one case the
// core never sees: a file whose bytes aren't valid JSON, so no referral row
// exists to reference.
export type FileResult = IngestionResult | { status: "rejected"; errorReason: string };

// Each terminal status gets a subfolder inside the watched directory, so an
// operator sees at a glance what happened to every dropped file. They sit one
// level below the watched files, out of watch range (see startWatcher).
const RESULT_FOLDER = {
  ingested: "ingested",
  duplicate: "duplicate",
  rejected: "rejected",
} as const;

type ResultHandler = (filePath: string, result: FileResult) => void;

// Read + parse + ingest a single file, then file it under its result folder.
// Testable in isolation: pass a db and the incoming directory, no watcher needed.
export async function processReferralFile(
  filePath: string,
  db: Db,
  incomingDirectory: string,
): Promise<FileResult> {
  const parsed = await readBundle(filePath);
  const result: FileResult = parsed.ok
    ? await ingestReferral(parsed.bundle, db)
    : { status: "rejected", errorReason: parsed.reason };

  const reason = result.status === "rejected" ? result.errorReason : undefined;
  await moveToResultFolder(filePath, incomingDirectory, result.status, reason);
  return result;
}

export type WatcherHandle = {
  // Resolves once the initial scan of pre-existing files has been dispatched.
  ready: Promise<void>;
  close: () => Promise<void>;
};

// Watch incomingDirectory for *.json drops (existing files first, then new
// ones) and process each. Long-lived: the caller owns the db pool and lifetime.
export function startWatcher(
  db: Db,
  incomingDirectory: string,
  onResult: ResultHandler = logResult,
): WatcherHandle {
  const root = resolve(incomingDirectory);
  const watcher = watch(root, {
    // Result folders live inside root; depth 0 keeps the watch on top-level
    // files only, and the ignore matcher stops chokidar even statting them —
    // so a moved file never re-fires as a new drop.
    depth: 0,
    ignored: (candidatePath) => isResultFolder(candidatePath, root),
    // fs events can fire mid-write; wait for the file to stop growing so
    // JSON.parse always sees a complete bundle.
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on("add", (filePath) => {
    if (extname(filePath) !== ".json") return;
    void handleFile(filePath, db, root, onResult);
  });
  watcher.on("error", (error) => console.error(`[watcher] ${errorMessage(error)}`));

  const ready = new Promise<void>((resolveReady) => watcher.on("ready", resolveReady));
  return { ready, close: () => watcher.close() };
}

// One file's failure must not take down the watcher. A thrown error here means
// something beyond the file (e.g. the db is unreachable): leave it in place so a
// later restart retries it, rather than misfiling it as rejected.
async function handleFile(
  filePath: string,
  db: Db,
  incomingDirectory: string,
  onResult: ResultHandler,
): Promise<void> {
  try {
    onResult(filePath, await processReferralFile(filePath, db, incomingDirectory));
  } catch (error) {
    console.error(`[watcher] could not process ${basename(filePath)}: ${errorMessage(error)}`);
  }
}

async function readBundle(
  filePath: string,
): Promise<{ ok: true; bundle: unknown } | { ok: false; reason: string }> {
  try {
    return { ok: true, bundle: JSON.parse(await readFile(filePath, "utf8")) };
  } catch (error) {
    return { ok: false, reason: `invalid JSON: ${errorMessage(error)}` };
  }
}

async function moveToResultFolder(
  filePath: string,
  incomingDirectory: string,
  status: IngestionResult["status"],
  errorReason: string | undefined,
): Promise<void> {
  const targetFolder = join(incomingDirectory, RESULT_FOLDER[status]);
  await mkdir(targetFolder, { recursive: true });
  const destination = await nonClashingPath(join(targetFolder, basename(filePath)));
  await rename(filePath, destination);
  if (status === "rejected" && errorReason) {
    // Keep the reason beside the file so a rejection is diagnosable without the log.
    await writeFile(`${destination}.reason.txt`, `${errorReason}\n`);
  }
}

// Two different files can share a name across time; append a counter rather than
// clobber an earlier result.
async function nonClashingPath(preferredPath: string): Promise<string> {
  if (!(await pathExists(preferredPath))) return preferredPath;
  const extension = extname(preferredPath);
  const stem = preferredPath.slice(0, preferredPath.length - extension.length);
  for (let counter = 1; ; counter += 1) {
    const candidate = `${stem}-${counter}${extension}`;
    if (!(await pathExists(candidate))) return candidate;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// True for the result folders and anything inside them.
function isResultFolder(candidatePath: string, incomingDirectory: string): boolean {
  const [firstSegment] = relative(incomingDirectory, candidatePath).split(sep);
  return firstSegment !== undefined && (Object.values(RESULT_FOLDER) as string[]).includes(firstSegment);
}

function logResult(filePath: string, result: FileResult): void {
  const name = basename(filePath);
  switch (result.status) {
    case "ingested":
      console.log(`[ingested]  ${name} → patient=${result.patientId} visit=${result.visitId}`);
      return;
    case "duplicate":
      console.log(`[duplicate] ${name} → referral=${result.referralId}`);
      return;
    case "rejected":
      console.log(`[rejected]  ${name} → ${result.errorReason}`);
      return;
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Runnable entry: one long-lived pool, closed on graceful shutdown. Guarded so
// importing this module (e.g. from a test) doesn't start watching.
if (import.meta.main) {
  const incomingDirectory = resolve(import.meta.dir, "..", "incoming");
  const db = createDb();
  const watcherHandle = startWatcher(db, incomingDirectory);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[watcher] ${signal} received, shutting down`);
    await watcherHandle.close();
    await db.$client.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await watcherHandle.ready;
  console.log(`[watcher] watching ${incomingDirectory} for *.json (Ctrl-C to stop)`);
}

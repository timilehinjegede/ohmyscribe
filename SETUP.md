# Local setup

Everything you need to run ohmyscribe end to end on your machine: Postgres, the API, the
ingestion watcher, sample patient data, and the mobile app.

Once Postgres is up, you'll have **three long-running processes** in three terminals:

| # | Process           | From the repo root | (or, in its own dir)              | What it does                              |
| - | ----------------- | ------------------ | --------------------------------- | ----------------------------------------- |
| 1 | API               | `bun run api`      | `cd apps/api && bun run dev`      | HTTP API on `:3000` (hot reload)          |
| 2 | Ingestion watcher | `bun run watch`    | `cd ingestion && bun run watch`   | Tails `ingestion/incoming/` for referrals |
| 3 | Mobile            | `bun run mobile`   | `cd apps/mobile && bun run start` | Expo dev server (open in Expo Go)         |

The `bun run api/watch/mobile` aliases just `cd` into the right workspace for you — same thing.

---

## Prerequisites

- **[Bun](https://bun.sh)** ≥ 1.3
- **PostgreSQL** — either **Docker** (a `docker-compose.yml` is included, easiest) or a
  local install (Postgres.app / Homebrew)
- **iOS Simulator** (Xcode) or the **Expo Go** app on a physical phone
- An **OpenAI API key** — only for the AI features (draft coding suggestions + audio
  transcription). The core flow (open a visit, answer items, code diagnoses, sync) works
  without it.

---

## 1. Install

```bash
git clone <repo> ohmyscribe
cd ohmyscribe
bun install
```

## 2. Start Postgres

Nothing else starts Postgres for you — `bun run api` only *connects* to it.

**With Docker (recommended):**

```bash
bun run db:up
```

That boots Postgres and, via `POSTGRES_DB`, auto-creates the `ohmyscribe` database — so you
can skip `createdb`. Data persists in a named volume across restarts.

**With a local Postgres install instead:**

```bash
createdb ohmyscribe
```

## 3. Environment

One `.env` at the repo root is shared by the API, the watcher, and Drizzle.

```bash
cp .env.example .env
```

Set `DATABASE_URL`. For the Docker Postgres above:

```dotenv
DATABASE_URL=postgresql://ohmyscribe:ohmyscribe@localhost:5432/ohmyscribe
```

For a local Postgres install, use your own user (e.g. `postgresql://you@localhost:5432/ohmyscribe`). `OPENAI_API_KEY` is optional; only the AI features need it.

## 4. Run migrations

```bash
bun run db:migrate
```

> `bun run db:studio` opens a browser DB explorer. After changing the schema,
> `cd packages/db && bun run db:generate` writes a new migration.

## 5. Start the API

```bash
bun run api
```

## 6. Start the ingestion watcher

```bash
bun run watch
```

Leave it running. It's the "listener": drop a referral bundle into the folder and it
ingests it automatically.

## 7. Load sample patients

The repo ships 15 synthetic Synthea referral bundles. Drop them into the watched folder:

```bash
cp fixtures/synthea/*.json ingestion/incoming/
```

The watcher picks up each file, inserts a **patient + visit + diagnoses**, and
moves the file into a result subfolder so you can see what happened:

```
ingestion/incoming/
├─ ingested/     succeeded
├─ duplicate/    same referral already seen (idempotent by content hash)
└─ rejected/     invalid — a <name>.reason.txt sits beside it explaining why
```

You'll see `[ingested] referral-01.json → patient=… visit=…` lines in terminal 2.

> **One-off alternative** (no watcher): `cd ingestion && bun --env-file=../.env run
> scripts/ingest.ts ../fixtures/synthea/referral-01.json`

## 8. Start the mobile app — terminal 3

```bash
bun run mobile
```

The simulator reaches the API at `http://localhost:3000` by default — no config needed.

### On a physical phone (Expo Go)

Your phone can't reach `localhost`, so point it at your Mac's LAN IP:

```bash
EXPO_PUBLIC_API_URL=http://<your-mac-ip>:3000 bun run mobile
```

Find your IP with `ipconfig getifaddr en0`. Phone and Mac must be on the same Wi-Fi. Scan
the QR code with Expo Go.

---

## End-to-end smoke test

1. Open the app → the ingested visits appear (pull-to-refresh if not).
2. Open a visit → answer OASIS items and code diagnoses.
3. Turn on **airplane mode** and keep editing — everything saves locally; the **Sync** tab
   shows what's pending.
4. Turn Wi-Fi back on → the queue drains to **"All synced."**

> The offline demo needs a **real device + LAN IP** (step 8). The simulator's `localhost`
> is loopback, so airplane mode / your Mac's connectivity doesn't affect it.

---

## Resetting the database

**Docker:**

```bash
bun run db:reset
```

**Local Postgres install:**

```bash
dropdb ohmyscribe && createdb ohmyscribe
bun run db:migrate
```

Fixtures are idempotent (deduped by content hash), so after a reset just re-run step 7 to
repopulate.

---

## Good to know

- **OpenAI-gated features:** the "AI draft" on the coding step and "Transcribe" on the
  review step. Without `OPENAI_API_KEY` they simply no-op; everything else works.
- **Online-only by design:** filing an assessment (it snapshots the PDGM score) requires
  the server.
- **Stop Postgres:** `bun run db:down` (data survives; `db:reset` is what wipes it).

---


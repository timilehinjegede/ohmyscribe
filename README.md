# ohmyscribe

An offline-first app for home-health nurses to fill out OASIS assessments on their phone.

A nurse visits a patient and fills out the OASIS assessment on their phone. It works with no connection and syncs to the server once it's back online. An AI suggests draft answers and diagnosis codes, but nothing is saved until the nurse confirms it. The AI never fills the assessment in on its own. Referrals are ingested ahead of time, so when the nurse opens a visit the patient and their diagnoses are already there.

Everything runs on synthetic patient data from [Synthea](https://synthea.mitre.org/), not real records.

See [SETUP.md](SETUP.md) to run it locally.

## How it fits together

It's a monorepo with three parts.

**Ingestion** watches a folder for referral files (FHIR JSON), parses and validates each one, and inserts the patient, visit, and diagnoses. A malformed file gets moved to a `rejected/` folder instead of being half-imported.

**The API** is a Bun + Hono server over Postgres. It's the source of truth on the server side and handles sync, the AI coding suggestions, PDGM scoring, and pulling answers out of a visit transcript.

**The mobile app** is Expo / React Native. Its local SQLite database is the source of truth on the device, so it reads and writes locally and never waits on the network. It syncs with the API in the background.

## Stack

| Layer     | Tech |
| --------- | ---- |
| Mobile    | Expo / React Native, TypeScript, expo-sqlite |
| Backend   | Bun, Hono, PostgreSQL, Drizzle ORM |
| AI        | OpenAI (diagnosis-coding suggestions, audio transcription) |
| Ingestion | An `ingestReferral` function plus a chokidar file watcher |

## Layout

```
ohmyscribe/
├─ apps/
│  ├─ mobile/     Expo React Native app
│  └─ api/        Bun + Hono API
├─ packages/
│  ├─ shared/     OASIS items, PDGM tables, ICD-10 crosswalk, shared Zod schemas
│  └─ db/         Drizzle schema and migrations (used by the API and ingestion)
├─ ingestion/     the ingestReferral function and its file watcher
│  └─ incoming/   drop referral *.json here; processed files move to ingested/, duplicate/, or rejected/
├─ fixtures/      15 Synthea referral bundles
└─ docs/          design and architecture notes
```

## Status

Built:

- [x] Offline sync (local SQLite, push/pull, syncs on reconnect)
- [x] AI diagnosis-coding suggestions
- [x] Audio transcription into draft answers
- [x] PDGM scoring (illustrative rates, real algorithm)
- [x] Referral ingestion (file watcher)

Roadmap:

- [ ] Real CMS PDGM values (clinical-group crosswalk, case-mix weights, base rate)
- [ ] Fuller OASIS item catalog and ICD-10 crosswalk beyond the demo fixtures
- [ ] Chunked audio capture for long visits
- [ ] Save the full visit transcript, not just the extracted answers
- [ ] Encrypt the on-device SQLite database (SQLCipher)
- [ ] Deploy the API and a hosted app build (local-only today)
- [ ] Eval harness to score the AI coding against known-good charts
- [ ] Scheduled ingestion (e.g. Dagster) instead of the local watcher

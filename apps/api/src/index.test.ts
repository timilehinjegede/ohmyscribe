import { afterAll, beforeAll, expect, test } from "bun:test";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  DEFAULT_REVIEWER_ID,
  answerSuggestions,
  assessmentAnswers,
  assessments,
  auditLogs,
  diagnoses,
  diagnosisCodings,
  diagnosisSuggestions,
  patients,
  qualityFlags,
  assessmentTranscripts,
  visits,
} from "@ohmyscribe/db";
import {
  assessmentDetailSchema,
  codedDiagnosisSchema,
  visitDetailSchema,
  visitListItemSchema,
  type PdgmResult,
} from "@ohmyscribe/shared";
import { z } from "zod";
import { db } from "./db.ts";
import { gatherAnalytics } from "./analytics.ts";
import { extractAnswers } from "./answer-suggestions.ts";
import { getAssessment } from "./assessments.ts";
import { selectPicks, suggestCoding } from "./diagnosis-suggestions.ts";
import { persistQualityFlags } from "./quality-flags.ts";
import { pull, push } from "./sync.ts";
import server from "./index.ts";

// Integration tests: they hit the real Postgres (DATABASE_URL must be set) via the
// app's own pool, seeding a throwaway patient/visit and cleaning it up after.
let patientId: string;
let visitId: string;
let assessmentId: string;
let hypertensionId: string;
let asthmaId: string;
let completedAt: string | null = null;

beforeAll(async () => {
  const [patient] = await db
    .insert(patients)
    .values({ name: "Test Patient", dob: "1950-01-02", source: "test" })
    .returning({ id: patients.id });
  patientId = patient!.id;

  const [visit] = await db
    .insert(visits)
    .values({ patientId, type: "SOC", status: "open" })
    .returning({ id: visits.id });
  visitId = visit!.id;

  await db.insert(diagnoses).values({
    visitId,
    system: "http://snomed.info/sct",
    code: "111",
    display: "Anemia (disorder)",
  });

  // Crosswalk-coded diagnoses with onset for the coding tests; "111" above is
  // intentionally off-crosswalk (no suggestion) and onset-less (so it ranks last).
  const [hypertension] = await db
    .insert(diagnoses)
    .values({
      visitId,
      system: "http://snomed.info/sct",
      code: "59621000",
      display: "Essential hypertension (disorder)",
      onset: new Date("2022-06-01"),
    })
    .returning({ id: diagnoses.id });
  hypertensionId = hypertension!.id;

  const [asthma] = await db
    .insert(diagnoses)
    .values({
      visitId,
      system: "http://snomed.info/sct",
      code: "195967001",
      display: "Asthma (disorder)",
      onset: new Date("2020-06-01"),
    })
    .returning({ id: diagnoses.id });
  asthmaId = asthma!.id;
});

afterAll(async () => {
  // assessment rows FK the visit — remove them before the visit.
  const rows = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.visitId, visitId));
  for (const row of rows) {
    await db.delete(assessmentAnswers).where(eq(assessmentAnswers.assessmentId, row.id));
    await db.delete(diagnosisCodings).where(eq(diagnosisCodings.assessmentId, row.id));
    await db.delete(diagnosisSuggestions).where(eq(diagnosisSuggestions.assessmentId, row.id));
    await db.delete(answerSuggestions).where(eq(answerSuggestions.assessmentId, row.id));
    await db.delete(qualityFlags).where(eq(qualityFlags.assessmentId, row.id));
    await db.delete(auditLogs).where(eq(auditLogs.assessmentId, row.id));
    await db.delete(assessmentTranscripts).where(eq(assessmentTranscripts.assessmentId, row.id));
  }
  await db.delete(assessments).where(eq(assessments.visitId, visitId));
  await db.delete(diagnoses).where(eq(diagnoses.visitId, visitId));
  await db.delete(visits).where(eq(visits.id, visitId));
  await db.delete(patients).where(eq(patients.id, patientId));
  await db.$client.end();
});

const get = (path: string) => server.fetch(new Request(`http://localhost${path}`));
const post = (path: string) =>
  server.fetch(new Request(`http://localhost${path}`, { method: "POST" }));
const patch = (path: string, body: unknown) =>
  server.fetch(
    new Request(`http://localhost${path}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const del = (path: string, body: unknown) =>
  server.fetch(
    new Request(`http://localhost${path}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const postJson = (path: string, body: unknown) =>
  server.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const postForm = (path: string, fields: [string, string][]) =>
  server.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    }),
  );

test("GET /health -> 200", async () => {
  const res = await get("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("GET /visits/:id with a non-UUID -> 400", async () => {
  const res = await get("/visits/not-a-uuid");
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "invalid visit id" });
});

test("GET /visits/:id unknown -> 404", async () => {
  const res = await get("/visits/11111111-1111-1111-1111-111111111111");
  expect(res.status).toBe(404);
});

test("GET /visits -> 200, conforms to visitListItemSchema[], with joined patient name", async () => {
  const res = await get("/visits");
  expect(res.status).toBe(200);
  const list = z.array(visitListItemSchema).parse(await res.json());
  const seeded = list.find((visit) => visit.id === visitId);
  expect(seeded?.patientName).toBe("Test Patient");
});

test("GET /visits/:id -> 200, conforms to visitDetailSchema, internal columns projected out", async () => {
  const res = await get(`/visits/${visitId}`);
  expect(res.status).toBe(200);
  const raw: any = await res.json();
  // projection: internal/sensitive columns are not sent
  expect(raw).not.toHaveProperty("serverSeq");
  expect(raw.patient).not.toHaveProperty("externalId");
  // contract: the response validates against the shared schema
  const body = visitDetailSchema.parse(raw);
  expect(body.patient?.name).toBe("Test Patient");
  expect(body.diagnoses).toHaveLength(3);
  expect(body.diagnoses.some((diagnosis) => diagnosis.display === "Anemia (disorder)")).toBe(true);
});

test("POST /visits/:id/assessment -> 200, creates and returns the assessment", async () => {
  const res = await post(`/visits/${visitId}/assessment`);
  expect(res.status).toBe(200);
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.visitId).toBe(visitId);
  assessmentId = body.id;
});

test("POST /visits/:id/assessment is idempotent (same visit -> same assessment id)", async () => {
  const res = await post(`/visits/${visitId}/assessment`);
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.id).toBe(assessmentId);
});

test("GET /visits/:id -> assessment summary shows 0 answers before any are saved", async () => {
  const res = await get(`/visits/${visitId}`);
  const body = visitDetailSchema.parse(await res.json());
  expect(body.assessment).not.toBeNull();
  expect(body.assessment?.answeredCount).toBe(0);
});

test("POST /visits/:id/assessment -> 404 for an unknown visit", async () => {
  const res = await post("/visits/11111111-1111-1111-1111-111111111111/assessment");
  expect(res.status).toBe(404);
});

test("PATCH /assessments/:id/answers -> 200, upserts a valid answer", async () => {
  const res = await patch(`/assessments/${assessmentId}/answers`, {
    answers: [{ itemCode: "M1830", value: "2", updatedAt: new Date().toISOString() }],
  });
  expect(res.status).toBe(200);
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.answers.find((answer) => answer.itemCode === "M1830")?.value).toBe("2");
});

test("PATCH /assessments/:id/answers -> 400 on a valid code with an impossible value", async () => {
  const res = await patch(`/assessments/${assessmentId}/answers`, {
    answers: [{ itemCode: "M1860", value: "9", updatedAt: new Date().toISOString() }],
  });
  expect(res.status).toBe(400);
});

test("PATCH /assessments/:id/answers applies last-write-wins (stale update ignored)", async () => {
  const older = new Date(Date.now() - 60_000).toISOString();
  const newer = new Date().toISOString();
  await patch(`/assessments/${assessmentId}/answers`, {
    answers: [{ itemCode: "M1850", value: "1", updatedAt: newer }],
  });
  const res = await patch(`/assessments/${assessmentId}/answers`, {
    answers: [{ itemCode: "M1850", value: "4", updatedAt: older }],
  });
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.answers.find((answer) => answer.itemCode === "M1850")?.value).toBe("1");
});

test("PATCH /assessments/:id/answers -> 400 on an unknown itemCode", async () => {
  const res = await patch(`/assessments/${assessmentId}/answers`, {
    answers: [{ itemCode: "ZZZ", value: "0", updatedAt: new Date().toISOString() }],
  });
  expect(res.status).toBe(400);
});

test("PATCH /assessments/:id/answers -> 400 when updatedAt is missing", async () => {
  const res = await patch(`/assessments/${assessmentId}/answers`, {
    answers: [{ itemCode: "M1830", value: "2" }],
  });
  expect(res.status).toBe(400);
});

test("PATCH /assessments/:id/answers dedupes a repeated itemCode (last wins, no 500)", async () => {
  const now = new Date().toISOString();
  const res = await patch(`/assessments/${assessmentId}/answers`, {
    answers: [
      { itemCode: "M1800", value: "0", updatedAt: now },
      { itemCode: "M1800", value: "3", updatedAt: now },
    ],
  });
  expect(res.status).toBe(200);
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.answers.find((answer) => answer.itemCode === "M1800")?.value).toBe("3");
});

test("GET /assessments/:id/diagnoses -> 200, crosswalk suggestions, onset-ranked (nulls last)", async () => {
  const res = await get(`/assessments/${assessmentId}/diagnoses`);
  expect(res.status).toBe(200);
  const coded = z.array(codedDiagnosisSchema).parse(await res.json());
  expect(coded.find((d) => d.diagnosisId === hypertensionId)?.suggestedCode?.icd10).toBe("I10");
  // "111" is not in the crosswalk -> no suggested code
  expect(coded.find((d) => d.code === "111")?.suggestedCode).toBeNull();
  // the AI role suggestion is null until that pipeline runs
  expect(coded[0]?.suggestion).toBeNull();
  // onset desc, nulls last: dated diagnoses lead, the onset-less "111" trails
  expect(coded[0]?.diagnosisId).toBe(hypertensionId);
  expect(coded.at(-1)?.code).toBe("111");
});

test("PATCH /assessments/:id/codings -> 200, codes a diagnosis as primary", async () => {
  const res = await patch(`/assessments/${assessmentId}/codings`, {
    diagnosisId: hypertensionId,
    icd10Code: "I10",
    isPrimary: true,
    updatedAt: new Date().toISOString(),
  });
  expect(res.status).toBe(200);
  const coded = z.array(codedDiagnosisSchema).parse(await res.json());
  expect(coded.find((d) => d.diagnosisId === hypertensionId)?.coding).toEqual({
    icd10Code: "I10",
    isPrimary: true,
  });
});

test("PATCH /assessments/:id/codings -> 400 on a code outside the allowlist", async () => {
  const res = await patch(`/assessments/${assessmentId}/codings`, {
    diagnosisId: hypertensionId,
    icd10Code: "Z99.9", // well-formed but not a crosswalk code
    isPrimary: false,
    updatedAt: new Date().toISOString(),
  });
  expect(res.status).toBe(400);
});

test("PATCH /assessments/:id/codings -> a new primary returns the old one to the pool", async () => {
  const res = await patch(`/assessments/${assessmentId}/codings`, {
    diagnosisId: asthmaId,
    icd10Code: "J45.909",
    isPrimary: true,
    updatedAt: new Date().toISOString(),
  });
  const coded = z.array(codedDiagnosisSchema).parse(await res.json());
  expect(coded.find((d) => d.diagnosisId === asthmaId)?.coding?.isPrimary).toBe(true);
  // the demoted primary goes back to the suggestion pool, not silently into the secondaries
  expect(coded.find((d) => d.diagnosisId === hypertensionId)?.coding).toBeNull();
});

test("PATCH /assessments/:id/codings -> 422 for a diagnosis not in this assessment's visit", async () => {
  const res = await patch(`/assessments/${assessmentId}/codings`, {
    diagnosisId: "11111111-1111-1111-1111-111111111111",
    icd10Code: "I10",
    isPrimary: false,
    updatedAt: new Date().toISOString(),
  });
  expect(res.status).toBe(422);
});

test("PATCH /assessments/:id/codings applies last-write-wins (stale update ignored)", async () => {
  const older = new Date(Date.now() - 60_000).toISOString();
  const newer = new Date().toISOString();
  await patch(`/assessments/${assessmentId}/codings`, {
    diagnosisId: asthmaId,
    icd10Code: "J45.909",
    isPrimary: true,
    updatedAt: newer,
  });
  const res = await patch(`/assessments/${assessmentId}/codings`, {
    diagnosisId: asthmaId,
    icd10Code: "D64.9",
    isPrimary: true,
    updatedAt: older,
  });
  const coded = z.array(codedDiagnosisSchema).parse(await res.json());
  expect(coded.find((d) => d.diagnosisId === asthmaId)?.coding?.icd10Code).toBe("J45.909");
});

test("PATCH /assessments/:id/codings: a stale primary write can't blank the primary", async () => {
  // asthma is the current primary and hypertension already has a newer coding, so a stale
  // isPrimary write to hypertension must be a no-op — not demote asthma then install nothing.
  const stale = new Date(Date.now() - 3_600_000).toISOString();
  await patch(`/assessments/${assessmentId}/codings`, {
    diagnosisId: hypertensionId,
    icd10Code: "I10",
    isPrimary: true,
    updatedAt: stale,
  });
  const coded = z
    .array(codedDiagnosisSchema)
    .parse(await (await get(`/assessments/${assessmentId}/diagnoses`)).json());
  const primaries = coded.filter((d) => d.coding?.isPrimary);
  expect(primaries).toHaveLength(1);
  expect(primaries[0]?.diagnosisId).toBe(asthmaId);
});

test("DELETE /assessments/:id/codings/:diagnosisId returns a coding to the suggestion pool", async () => {
  // add hypertension as a secondary, then remove it with a later clock (LWW)
  const added = new Date();
  await patch(`/assessments/${assessmentId}/codings`, {
    diagnosisId: hypertensionId,
    icd10Code: "I10",
    isPrimary: false,
    updatedAt: added.toISOString(),
  });
  const res = await del(`/assessments/${assessmentId}/codings/${hypertensionId}`, {
    updatedAt: new Date(added.getTime() + 1000).toISOString(),
  });
  expect(res.status).toBe(200);
  const coded = z.array(codedDiagnosisSchema).parse(await res.json());
  expect(coded.find((d) => d.diagnosisId === hypertensionId)?.coding).toBeNull();
  expect(coded.find((d) => d.diagnosisId === asthmaId)?.coding?.isPrimary).toBe(true);
});

test("DELETE /assessments/:id/codings/:diagnosisId ignores a stale remove (last-write-wins)", async () => {
  // future clock so this save is unambiguously the newest write to the shared row
  const addAt = new Date(Date.now() + 120_000);
  await patch(`/assessments/${assessmentId}/codings`, {
    diagnosisId: hypertensionId,
    icd10Code: "I10",
    isPrimary: false,
    updatedAt: addAt.toISOString(),
  });
  // a remove with an older clock than that save must not delete it
  const res = await del(`/assessments/${assessmentId}/codings/${hypertensionId}`, {
    updatedAt: new Date(addAt.getTime() - 60_000).toISOString(),
  });
  expect(res.status).toBe(200);
  const coded = z.array(codedDiagnosisSchema).parse(await res.json());
  expect(coded.find((d) => d.diagnosisId === hypertensionId)?.coding).not.toBeNull();
});

// The real CallCodingModel hits OpenAI; these stubs keep the suggestion tests deterministic/offline.
const clearSuggestions = () =>
  db.delete(diagnosisSuggestions).where(eq(diagnosisSuggestions.assessmentId, assessmentId));

test("suggestCoding writes the model's primary + secondary role picks", async () => {
  await clearSuggestions();
  await suggestCoding(db, assessmentId, async () => ({
    primary: { diagnosisId: hypertensionId, rationale: "chief reason for care", confidence: 0.9 },
    secondaries: [{ diagnosisId: asthmaId, rationale: "managed comorbidity", confidence: 0.6 }],
  }));
  const coded = z
    .array(codedDiagnosisSchema)
    .parse(await (await get(`/assessments/${assessmentId}/diagnoses`)).json());
  expect(coded.find((d) => d.diagnosisId === hypertensionId)?.suggestion?.isPrimary).toBe(true);
  expect(coded.find((d) => d.diagnosisId === hypertensionId)?.suggestion?.rationale).toBe(
    "chief reason for care",
  );
  expect(coded.find((d) => d.diagnosisId === asthmaId)?.suggestion?.isPrimary).toBe(false);
});

test("suggestCoding is cached — a second call skips the model", async () => {
  await clearSuggestions();
  let calls = 0;
  const counting = async () => {
    calls++;
    return {
      primary: { diagnosisId: hypertensionId, rationale: "cached", confidence: 0.5 },
      secondaries: [],
    };
  };
  await suggestCoding(db, assessmentId, counting);
  await suggestCoding(db, assessmentId, counting);
  expect(calls).toBe(1);
});

test("suggestCoding drops diagnosis ids the model invents", async () => {
  await clearSuggestions();
  await suggestCoding(db, assessmentId, async () => ({
    primary: {
      diagnosisId: "11111111-1111-1111-1111-111111111111",
      rationale: "invented",
      confidence: 0.9,
    },
    secondaries: [{ diagnosisId: asthmaId, rationale: "real", confidence: 0.6 }],
  }));
  const coded = z
    .array(codedDiagnosisSchema)
    .parse(await (await get(`/assessments/${assessmentId}/diagnoses`)).json());
  // the invented primary is dropped; only the real secondary survives
  expect(coded.some((d) => d.suggestion?.isPrimary)).toBe(false);
  expect(coded.find((d) => d.diagnosisId === asthmaId)?.suggestion?.isPrimary).toBe(false);
});

test("suggestCoding is best-effort — a model failure writes nothing", async () => {
  await clearSuggestions();
  await suggestCoding(db, assessmentId, async () => {
    throw new Error("model unavailable");
  });
  const coded = z
    .array(codedDiagnosisSchema)
    .parse(await (await get(`/assessments/${assessmentId}/diagnoses`)).json());
  expect(coded.every((d) => d.suggestion === null)).toBe(true);
});

test("suggestCoding leaves a 'suggested' audit row per pick, keyed by diagnosis id", async () => {
  const suggestedAuditRows = await db
    .select({ itemCode: auditLogs.itemCode, actorId: auditLogs.actorId })
    .from(auditLogs)
    .where(and(eq(auditLogs.assessmentId, assessmentId), eq(auditLogs.event, "suggested")));
  const auditedItemCodes = suggestedAuditRows.map((row) => row.itemCode);
  expect(auditedItemCodes).toContain(hypertensionId);
  expect(auditedItemCodes).toContain(asthmaId);
  expect(suggestedAuditRows.every((row) => row.actorId === null)).toBe(true);
});

test("POST /assessments/:id/suggest-coding -> 404 for an unknown assessment", async () => {
  const res = await post("/assessments/11111111-1111-1111-1111-111111111111/suggest-coding");
  expect(res.status).toBe(404);
});

// Pure unit tests for the id-validation / dedup / cap branches (the fixture is too small to reach
// them through the DB path: it holds only three diagnoses).
const secondary = (diagnosisId: string) => ({ diagnosisId, rationale: "", confidence: 1 });

test("selectPicks caps secondaries at five", () => {
  const ids = new Set(["p", "a", "b", "c", "d", "e", "f"]);
  const picks = selectPicks(
    { primary: secondary("p"), secondaries: ["a", "b", "c", "d", "e", "f"].map(secondary) },
    ids,
  );
  expect(picks.filter((pick) => !pick.isPrimary)).toHaveLength(5);
});

test("selectPicks dedupes a diagnosis suggested as both primary and secondary", () => {
  const picks = selectPicks(
    { primary: secondary("x"), secondaries: [secondary("x")] },
    new Set(["x"]),
  );
  expect(picks).toHaveLength(1);
  expect(picks[0]?.isPrimary).toBe(true);
});

test("selectPicks keeps secondaries when the primary is null", () => {
  const picks = selectPicks({ primary: null, secondaries: [secondary("a")] }, new Set(["a"]));
  expect(picks).toEqual([{ diagnosisId: "a", isPrimary: false, rationale: "", confidence: 1 }]);
});

test("selectPicks drops an invented secondary id", () => {
  const picks = selectPicks(
    { primary: null, secondaries: [secondary("real"), secondary("fake")] },
    new Set(["real"]),
  );
  expect(picks.map((pick) => pick.diagnosisId)).toEqual(["real"]);
});

test("extractAnswers writes validated drafts and drops hallucinated item/value", async () => {
  const drafted = await extractAnswers(db, assessmentId, "visit note", async () => [
    { itemCode: "M1800", value: "0", transcriptSnippet: "grooms self", confidence: 0.9 },
    { itemCode: "ZZZZ", value: "0", transcriptSnippet: "n/a", confidence: 0.5 }, // not in catalog
    { itemCode: "M1830", value: "99", transcriptSnippet: "n/a", confidence: 0.5 }, // off-scale value
  ]);
  expect(drafted).toBe(1);
  const detail = await getAssessment(db, assessmentId);
  expect(detail?.suggestions.map((suggestion) => suggestion.itemCode)).toEqual(["M1800"]);
  expect(detail?.suggestions[0]?.value).toBe("0");
  expect(detail?.suggestions[0]?.transcriptSnippet).toBe("grooms self");
});

test("extractAnswers replaces the prior drafts on a re-run", async () => {
  await extractAnswers(db, assessmentId, "different note", async () => [
    { itemCode: "M1810", value: "1", transcriptSnippet: "dresses with help", confidence: 0.8 },
  ]);
  const detail = await getAssessment(db, assessmentId);
  expect(detail?.suggestions.map((suggestion) => suggestion.itemCode)).toEqual(["M1810"]);
});

test("extractAnswers dedupes an item, keeping the highest-confidence valid draft", async () => {
  const drafted = await extractAnswers(db, assessmentId, "note", async () => [
    { itemCode: "M1800", value: "99", transcriptSnippet: "off-scale, dropped", confidence: 0.9 },
    { itemCode: "M1800", value: "0", transcriptSnippet: "valid but lower conf", confidence: 0.4 },
    { itemCode: "M1800", value: "2", transcriptSnippet: "someone must assist", confidence: 0.8 },
  ]);
  expect(drafted).toBe(1);
  const detail = await getAssessment(db, assessmentId);
  expect(detail?.suggestions).toHaveLength(1);
  // "0" appears first among valid drafts; "2" wins on confidence.
  expect(detail?.suggestions[0]?.value).toBe("2");
});

test("extractAnswers writes one 'suggested' audit row per drafted item, deduped across re-runs", async () => {
  // M1800 was drafted by two extractions above; the identical latest event is skipped.
  const m1800AuditRows = await db
    .select({ event: auditLogs.event, actorId: auditLogs.actorId })
    .from(auditLogs)
    .where(and(eq(auditLogs.assessmentId, assessmentId), eq(auditLogs.itemCode, "M1800")));
  expect(m1800AuditRows).toHaveLength(1);
  expect(m1800AuditRows[0]?.event).toBe("suggested");
  expect(m1800AuditRows[0]?.actorId).toBeNull();
});

test("POST /assessments/:id/extract -> 400 on an empty transcript", async () => {
  const res = await postJson(`/assessments/${assessmentId}/extract`, { transcript: "" });
  expect(res.status).toBe(400);
});

test("POST /assessments/:id/extract -> 404 for an unknown assessment", async () => {
  const res = await postJson("/assessments/11111111-1111-1111-1111-111111111111/extract", {
    transcript: "a note",
  });
  expect(res.status).toBe(404);
});

test("POST /assessments/:id/extract-audio -> 400 when no audio is uploaded", async () => {
  const res = await server.fetch(
    new Request(`http://localhost/assessments/${assessmentId}/extract-audio`, { method: "POST" }),
  );
  expect(res.status).toBe(400);
});

test("GET /assessments/:id/pdgm -> 404 for an unknown assessment", async () => {
  const res = await server.fetch(
    new Request("http://localhost/assessments/11111111-1111-1111-1111-111111111111/pdgm"),
  );
  expect(res.status).toBe(404);
});

test("POST /assessments/:id/extract-audio -> 404 for an unknown assessment", async () => {
  const form = new FormData();
  form.append("audio", new File(["fake audio"], "note.m4a", { type: "audio/m4a" }));
  const res = await server.fetch(
    new Request("http://localhost/assessments/11111111-1111-1111-1111-111111111111/extract-audio", {
      method: "POST",
      body: form,
    }),
  );
  expect(res.status).toBe(404);
});

test("GET /visits/:id reflects the assessment summary (answered, not yet complete)", async () => {
  const res = await get(`/visits/${visitId}`);
  const body = visitDetailSchema.parse(await res.json());
  expect(body.assessment).not.toBeNull();
  expect(body.assessment?.completedAt).toBeNull();
  expect(body.assessment?.answeredCount).toBeGreaterThan(0);
  expect(body.assessment?.codedCount).toBeGreaterThan(0);
});

// Filing reconciles live suggestions, so restore the picks the best-effort test cleared:
// asthma matches the coded primary, hypertension matches its coded secondary.
test("suggestCoding after a clear regenerates picks without duplicating 'suggested' audit rows", async () => {
  await suggestCoding(db, assessmentId, async () => ({
    primary: { diagnosisId: asthmaId, rationale: "primary focus of care", confidence: 0.9 },
    secondaries: [
      { diagnosisId: hypertensionId, rationale: "managed comorbidity", confidence: 0.7 },
    ],
  }));
  const asthmaSuggestedRows = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.assessmentId, assessmentId),
        eq(auditLogs.itemCode, asthmaId),
        eq(auditLogs.event, "suggested"),
      ),
    );
  expect(asthmaSuggestedRows).toHaveLength(1);
});

test("GET /assessments/:id/pdgm computes the real CY2025 grouping for the coded primary", async () => {
  const res = await get(`/assessments/${assessmentId}/pdgm`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    clinicalGroup: string;
    primaryAcceptable: boolean;
    functional: { points: number; level: string };
    comorbidity: { level: string };
    caseMixWeight: number;
    weightApproximated: boolean;
    estimatedPayment: number;
  };
  // Primary J45.909 (asthma); answers so far are M1830=2, M1850=1, M1800=3 → 3 + 1 + 3 points.
  expect(body.clinicalGroup).toBe("MMTA_RESPIRATORY");
  expect(body.primaryAcceptable).toBe(true);
  expect(body.functional.points).toBe(7);
  expect(body.functional.level).toBe("low");
  // The I10 secondary maps to no comorbidity subgroup in CY2025.
  expect(body.comorbidity.level).toBe("none");
  expect(body.caseMixWeight).toBe(0.9187); // 1LA11: early / community / low / none
  expect(body.weightApproximated).toBe(false);
  expect(body.estimatedPayment).toBeGreaterThan(0);
});

let pullCursorBeforeCompletion: number;
let filedPdgmSnapshot: PdgmResult | null = null;

test("POST /assessments/:id/complete -> 200, sets completedAt", async () => {
  pullCursorBeforeCompletion = (await pull(db, 0)).cursor;
  const res = await postJson(`/assessments/${assessmentId}/complete`, {
    timing: "early",
    admissionSource: "community",
  });
  expect(res.status).toBe(200);
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.completedAt).not.toBeNull();
  completedAt = body.completedAt;
  // The response carries the frozen snapshot: the grouping the /pdgm test above computed live.
  expect(body.pdgmSnapshot).not.toBeNull();
  expect(body.pdgmSnapshot?.clinicalGroup).toBe("MMTA_RESPIRATORY");
  expect(body.pdgmSnapshot?.caseMixWeight).toBe(0.9187);
  expect(body.pdgmSnapshot?.estimatedPayment).toBe(Math.round(0.9187 * 2057.35));
  filedPdgmSnapshot = body.pdgmSnapshot;
});

test("POST /assessments/:id/complete is write-once (repeat keeps the original timestamp)", async () => {
  const res = await postJson(`/assessments/${assessmentId}/complete`, {
    timing: "early",
    admissionSource: "community",
  });
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.completedAt).toBe(completedAt);
});

test("sync pull returns the completed assessments row with the frozen pdgm snapshot", async () => {
  const { changes } = await pull(db, pullCursorBeforeCompletion);
  const pulledAssessment = (
    changes.assessments as { id: string; pdgmSnapshot: PdgmResult | null }[]
  ).find((row) => row.id === assessmentId);
  expect(pulledAssessment).toBeDefined();
  expect(pulledAssessment?.pdgmSnapshot).not.toBeNull();
  expect(pulledAssessment?.pdgmSnapshot).toEqual(filedPdgmSnapshot!);
});

test("filing reconciles an edited answer to 'overridden', unattributed on an unassigned visit", async () => {
  const m1800AuditRows = await db
    .select({ event: auditLogs.event, actorId: auditLogs.actorId })
    .from(auditLogs)
    .where(and(eq(auditLogs.assessmentId, assessmentId), eq(auditLogs.itemCode, "M1800")))
    .orderBy(desc(auditLogs.serverSeq));
  // The filed answer "3" differs from the drafted "2".
  expect(m1800AuditRows[0]?.event).toBe("overridden");
  expect(m1800AuditRows[0]?.actorId).toBeNull();
  // The write-once refile above added nothing.
  expect(m1800AuditRows.filter((row) => row.event === "overridden")).toHaveLength(1);
});

test("filing reconciles codings that match the AI's role picks to 'accepted'", async () => {
  const latestEventFor = async (itemCode: string) =>
    (
      await db
        .select({ event: auditLogs.event })
        .from(auditLogs)
        .where(and(eq(auditLogs.assessmentId, assessmentId), eq(auditLogs.itemCode, itemCode)))
        .orderBy(desc(auditLogs.serverSeq))
        .limit(1)
    )[0]?.event;
  expect(await latestEventFor(asthmaId)).toBe("accepted"); // suggested primary, coded primary
  expect(await latestEventFor(hypertensionId)).toBe("accepted"); // suggested and coded secondary
});

test("filing leaves a replaced draft's item pending ('suggested' stays its latest event)", async () => {
  // M1810's draft was replaced by a later extraction, so there was no decision to record.
  const m1810AuditRows = await db
    .select({ event: auditLogs.event })
    .from(auditLogs)
    .where(and(eq(auditLogs.assessmentId, assessmentId), eq(auditLogs.itemCode, "M1810")))
    .orderBy(desc(auditLogs.serverSeq));
  expect(m1810AuditRows[0]?.event).toBe("suggested");
});

test("GET /pdgm returns the frozen snapshot once complete, ignoring the toggle", async () => {
  const res = await get(`/assessments/${assessmentId}/pdgm?admissionSource=institutional`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { admissionSource: string };
  // Filed with community; the snapshot stays community even when queried institutional.
  expect(body.admissionSource).toBe("community");
});

test("the frozen snapshot round-trips the acceptability and weight-provenance fields", async () => {
  const res = await get(`/assessments/${assessmentId}/pdgm`);
  const body = (await res.json()) as {
    primaryAcceptable: boolean;
    weightApproximated: boolean;
    caseMixWeight: number;
  };
  expect(body.primaryAcceptable).toBe(true);
  expect(body.weightApproximated).toBe(false);
  expect(body.caseMixWeight).toBe(0.9187);
});

test("GET /assessments/:id/pdgm -> 400 for an invalid toggle value", async () => {
  const res = await get(`/assessments/${assessmentId}/pdgm?timing=nonsense`);
  expect(res.status).toBe(400);
});

test("POST /assessments/:id/complete -> 404 for an unknown assessment", async () => {
  const res = await postJson("/assessments/11111111-1111-1111-1111-111111111111/complete", {
    timing: "early",
    admissionSource: "community",
  });
  expect(res.status).toBe(404);
});

test("PATCH /assessments/:id/answers -> 409 once complete, leaving the value unchanged", async () => {
  const res = await patch(`/assessments/${assessmentId}/answers`, {
    answers: [{ itemCode: "M1830", value: "3", updatedAt: new Date().toISOString() }],
  });
  expect(res.status).toBe(409);
  const reread = await post(`/visits/${visitId}/assessment`);
  const after = assessmentDetailSchema.parse(await reread.json());
  expect(after.answers.find((answer) => answer.itemCode === "M1830")?.value).toBe("2");
});

test("PATCH /assessments/:id/codings -> 409 once complete, leaving codings unchanged", async () => {
  const res = await patch(`/assessments/${assessmentId}/codings`, {
    diagnosisId: hypertensionId,
    icd10Code: "I10",
    isPrimary: true, // would demote asthma if it were applied
    updatedAt: new Date().toISOString(),
  });
  expect(res.status).toBe(409);
  const coded = z
    .array(codedDiagnosisSchema)
    .parse(await (await get(`/assessments/${assessmentId}/diagnoses`)).json());
  expect(coded.find((d) => d.diagnosisId === asthmaId)?.coding?.isPrimary).toBe(true);
});

// The mobile drain treats this 409 as "assessment filed first" and drops the queued recording.
test("POST /assessments/:id/extract-audio -> 409 once the assessment is complete", async () => {
  const form = new FormData();
  form.append("audio", new File(["fake audio"], "note.m4a", { type: "audio/m4a" }));
  const res = await server.fetch(
    new Request(`http://localhost/assessments/${assessmentId}/extract-audio`, {
      method: "POST",
      body: form,
    }),
  );
  expect(res.status).toBe(409);
});

test("GET /reviewer redirects to the analytics page", async () => {
  const res = await get("/reviewer");
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/reviewer/analytics");
});

test("GET /reviewer/analytics -> 200 HTML with acceptance, case-mix, and per-nurse sections", async () => {
  const res = await get("/reviewer/analytics");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const body = await res.text();
  expect(body).toContain("Acceptance by OASIS item");
  expect(body).toContain("Case-mix distribution");
  expect(body).toContain("Per-nurse summary");
  expect(body).toContain("M1800");
  expect(body).toContain("Unassigned");
});

test("gatherAnalytics aggregates the filed assessment's provenance", async () => {
  const analytics = await gatherAnalytics(db);
  const m1800Acceptance = analytics.acceptanceByItem.find((item) => item.itemCode === "M1800");
  expect(m1800Acceptance?.overridden).toBeGreaterThanOrEqual(1);
  expect(analytics.diagnosisAcceptance.accepted).toBeGreaterThanOrEqual(2);
  expect(analytics.cmiDistribution.filedCount).toBeGreaterThanOrEqual(1);
  const bucketTotal = analytics.cmiDistribution.buckets.reduce(
    (sum, bucket) => sum + bucket.count,
    0,
  );
  expect(bucketTotal).toBe(analytics.cmiDistribution.filedCount);
  const unassigned = analytics.perNurse.find((nurse) => nurse.userId === null);
  expect(unassigned?.filedVisits).toBeGreaterThanOrEqual(1);
  expect(unassigned?.overridden).toBeGreaterThanOrEqual(1);
});

test("sync push: new applies, a newer edit wins, a stale edit no-ops (LWW)", async () => {
  const id = crypto.randomUUID();
  const t0 = new Date(Date.now() - 3000).toISOString();
  const t1 = new Date(Date.now() - 2000).toISOString();
  const t2 = new Date(Date.now() - 1000).toISOString();
  const row = (updatedAt: string, value: string) => ({
    table: "assessment_answers" as const,
    id,
    updatedAt,
    deletedAt: null,
    assessmentId,
    itemCode: "SYNC_TEST",
    value,
  });

  expect((await push(db, [row(t1, "1")]))[0]?.status).toBe("applied");
  expect((await push(db, [row(t2, "3")]))[0]?.status).toBe("applied"); // newer wins
  expect((await push(db, [row(t0, "0")]))[0]?.status).toBe("stale"); // older no-ops

  const [stored] = await db
    .select({ value: assessmentAnswers.value })
    .from(assessmentAnswers)
    .where(eq(assessmentAnswers.id, id));
  expect(stored?.value).toBe("3");
});

test("sync push stamps a serverSeq the pull cursor picks up", async () => {
  const { cursor: before } = await pull(db, 0);
  const id = crypto.randomUUID();
  const applied = await push(db, [
    {
      table: "assessment_answers" as const,
      id,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      assessmentId,
      itemCode: "SYNC_TEST_2",
      value: "2",
    },
  ]);
  expect(applied[0]?.status).toBe("applied");

  const { changes, cursor } = await pull(db, before);
  expect(cursor).toBeGreaterThan(before);
  expect((changes.assessment_answers as { id: string }[]).some((a) => a.id === id)).toBe(true);
});

test("POST /sync/push -> 400 rejects a pull-only table", async () => {
  const res = await postJson("/sync/push", {
    rows: [
      {
        table: "visits",
        id: crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
    ],
  });
  expect(res.status).toBe(400);
});

test("sync push: an idempotent re-push acks applied with the serverSeq, not stale", async () => {
  const row = {
    table: "assessment_answers" as const,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    assessmentId,
    itemCode: "SYNC_IDEM",
    value: "1",
  };
  const first = await push(db, [row]);
  expect(first[0]?.status).toBe("applied");
  // A lost-ack retry re-pushes the same version: it must ack applied + the same serverSeq, or the
  // client can never clear pending (the version-guarded ack needs the seq).
  expect(await push(db, [row])).toEqual(first);
});

test("sync push: a natural-key collision rejects that row but the batch survives", async () => {
  // an answer created the REST way (server-generated id) for the same (assessment, item)
  await db
    .insert(assessmentAnswers)
    .values({ assessmentId, itemCode: "SYNC_COLLIDE", value: "5", updatedAt: new Date() });
  const collide = {
    table: "assessment_answers" as const,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    assessmentId,
    itemCode: "SYNC_COLLIDE",
    value: "9",
  };
  const ok = { ...collide, id: crypto.randomUUID(), itemCode: "SYNC_OK", value: "2" };
  const [r1, r2] = await push(db, [collide, ok]);
  expect(r1?.status).toBe("rejected");
  expect(r2?.status).toBe("applied"); // the sibling still went through
});

test("sync push: a stale edit can't revive a tombstone, but a newer re-add can", async () => {
  const id = crypto.randomUUID();
  const at = (updatedAt: string, deletedAt: string | null) => ({
    table: "assessment_answers" as const,
    id,
    updatedAt,
    deletedAt,
    assessmentId,
    itemCode: "SYNC_DEL",
    value: "1",
  });
  const created = new Date(Date.now() - 3000).toISOString();
  const deleted = new Date(Date.now() - 1000).toISOString();
  const stale = new Date(Date.now() - 2000).toISOString(); // older than the delete
  const readd = new Date().toISOString(); // newer than the delete

  await push(db, [at(created, null)]);
  await push(db, [at(deleted, deleted)]);
  await push(db, [at(stale, null)]); // stale un-delete, gated out, must not resurrect
  const [afterStale] = await db
    .select({ deletedAt: assessmentAnswers.deletedAt })
    .from(assessmentAnswers)
    .where(eq(assessmentAnswers.id, id));
  expect(afterStale?.deletedAt).not.toBeNull();

  await push(db, [at(readd, null)]); // newer re-add, revives (the legitimate case)
  const [afterReadd] = await db
    .select({ deletedAt: assessmentAnswers.deletedAt })
    .from(assessmentAnswers)
    .where(eq(assessmentAnswers.id, id));
  expect(afterReadd?.deletedAt).toBeNull();
});

test("sync push: a new primary coding demotes the old one (no one-primary collision)", async () => {
  const [p] = await db
    .insert(patients)
    .values({ name: "Sync Test", dob: "1950-01-01", source: "test" })
    .returning({ id: patients.id });
  const [v] = await db
    .insert(visits)
    .values({ patientId: p!.id, type: "SOC", status: "open" })
    .returning({ id: visits.id });
  const dx = async (code: string) =>
    (
      await db
        .insert(diagnoses)
        .values({ visitId: v!.id, system: "http://snomed.info/sct", code, display: code })
        .returning({ id: diagnoses.id })
    )[0]!.id;
  const d1 = await dx("59621000");
  const d2 = await dx("195967001");
  const [a] = await db
    .insert(assessments)
    .values({ visitId: v!.id, updatedAt: new Date() })
    .returning({ id: assessments.id });

  const coding = (updatedAt: string, diagnosisId: string) => ({
    table: "diagnosis_codings" as const,
    id: crypto.randomUUID(),
    updatedAt,
    deletedAt: null,
    assessmentId: a!.id,
    diagnosisId,
    icd10Code: "I10",
    isPrimary: true,
  });
  expect((await push(db, [coding(new Date(Date.now() - 1000).toISOString(), d1)]))[0]?.status).toBe(
    "applied",
  );
  expect((await push(db, [coding(new Date().toISOString(), d2)]))[0]?.status).toBe("applied");

  const live = await db
    .select({ diagnosisId: diagnosisCodings.diagnosisId })
    .from(diagnosisCodings)
    .where(
      and(
        eq(diagnosisCodings.assessmentId, a!.id),
        eq(diagnosisCodings.isPrimary, true),
        isNull(diagnosisCodings.deletedAt),
      ),
    );
  expect(live.length).toBe(1); // the partial one-primary index held
  expect(live[0]?.diagnosisId).toBe(d2); // the new primary won; the old was demoted

  await db.delete(diagnosisCodings).where(eq(diagnosisCodings.assessmentId, a!.id));
  await db.delete(qualityFlags).where(eq(qualityFlags.assessmentId, a!.id));
  await db.delete(auditLogs).where(eq(auditLogs.assessmentId, a!.id));
  await db.delete(assessmentTranscripts).where(eq(assessmentTranscripts.assessmentId, a!.id));
  await db.delete(assessments).where(eq(assessments.id, a!.id));
  await db.delete(diagnoses).where(eq(diagnoses.visitId, v!.id));
  await db.delete(visits).where(eq(visits.id, v!.id));
  await db.delete(patients).where(eq(patients.id, p!.id));
});

// Throwaway fixture for the quality-gate tests: the main fixture is already filed by now, and
// these need full control over the coded/answered state.
const seedQualityFixture = async () => {
  const [patient] = await db
    .insert(patients)
    .values({ name: "Quality Test", dob: "1950-01-01", source: "test" })
    .returning({ id: patients.id });
  const [visit] = await db
    .insert(visits)
    .values({ patientId: patient!.id, type: "SOC", status: "open" })
    .returning({ id: visits.id });
  const [diagnosis] = await db
    .insert(diagnoses)
    .values({
      visitId: visit!.id,
      system: "http://snomed.info/sct",
      code: "59621000",
      display: "Essential hypertension (disorder)",
    })
    .returning({ id: diagnoses.id });
  const [assessment] = await db
    .insert(assessments)
    .values({ visitId: visit!.id, updatedAt: new Date() })
    .returning({ id: assessments.id });
  return {
    patientId: patient!.id,
    visitId: visit!.id,
    diagnosisId: diagnosis!.id,
    assessmentId: assessment!.id,
  };
};

const cleanupQualityFixture = async (fixture: {
  patientId: string;
  visitId: string;
  assessmentId: string;
}) => {
  await db.delete(qualityFlags).where(eq(qualityFlags.assessmentId, fixture.assessmentId));
  await db.delete(auditLogs).where(eq(auditLogs.assessmentId, fixture.assessmentId));
  await db
    .delete(assessmentAnswers)
    .where(eq(assessmentAnswers.assessmentId, fixture.assessmentId));
  await db.delete(diagnosisCodings).where(eq(diagnosisCodings.assessmentId, fixture.assessmentId));
  await db
    .delete(answerSuggestions)
    .where(eq(answerSuggestions.assessmentId, fixture.assessmentId));
  await db
    .delete(assessmentTranscripts)
    .where(eq(assessmentTranscripts.assessmentId, fixture.assessmentId));
  await db.delete(assessments).where(eq(assessments.id, fixture.assessmentId));
  await db.delete(diagnoses).where(eq(diagnoses.visitId, fixture.visitId));
  await db.delete(visits).where(eq(visits.id, fixture.visitId));
  await db.delete(patients).where(eq(patients.id, fixture.patientId));
};

test("POST /assessments/:id/complete -> 422 with the missing-primary blocker, nothing files", async () => {
  const fixture = await seedQualityFixture();
  await patch(`/assessments/${fixture.assessmentId}/answers`, {
    answers: [{ itemCode: "M1830", value: "2", updatedAt: new Date().toISOString() }],
  });

  const res = await postJson(`/assessments/${fixture.assessmentId}/complete`, {
    timing: "early",
    admissionSource: "community",
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as { blockers: { ruleId: string; message: string }[] };
  expect(body.blockers.map((blocker) => blocker.ruleId)).toContain("missing-primary-diagnosis");

  const [assessmentAfter] = await db
    .select({ completedAt: assessments.completedAt })
    .from(assessments)
    .where(eq(assessments.id, fixture.assessmentId));
  expect(assessmentAfter?.completedAt).toBeNull();
  const [visitAfter] = await db
    .select({ status: visits.status })
    .from(visits)
    .where(eq(visits.id, fixture.visitId));
  expect(visitAfter?.status).toBe("open");
  const flags = await db
    .select({ id: qualityFlags.id })
    .from(qualityFlags)
    .where(eq(qualityFlags.assessmentId, fixture.assessmentId));
  expect(flags).toHaveLength(0);

  await cleanupQualityFixture(fixture);
});

test("POST /assessments/:id/complete -> 200 despite warnings, persisting them as quality flags", async () => {
  const fixture = await seedQualityFixture();
  await patch(`/assessments/${fixture.assessmentId}/codings`, {
    diagnosisId: fixture.diagnosisId,
    icd10Code: "I10",
    isPrimary: true,
    updatedAt: new Date().toISOString(),
  });
  // Bedfast ambulation with an independent transfer: contradictory, but only a warning.
  await patch(`/assessments/${fixture.assessmentId}/answers`, {
    answers: [
      { itemCode: "M1860", value: "6", updatedAt: new Date().toISOString() },
      { itemCode: "M1850", value: "0", updatedAt: new Date().toISOString() },
    ],
  });

  const res = await postJson(`/assessments/${fixture.assessmentId}/complete`, {
    timing: "early",
    admissionSource: "community",
  });
  expect(res.status).toBe(200);
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.completedAt).not.toBeNull();

  const flags = await db
    .select({
      ruleId: qualityFlags.ruleId,
      kind: qualityFlags.kind,
      itemCode: qualityFlags.itemCode,
      resolved: qualityFlags.resolved,
    })
    .from(qualityFlags)
    .where(eq(qualityFlags.assessmentId, fixture.assessmentId));
  const contradiction = flags.find(
    (flag) => flag.ruleId === "contradiction-bedfast-ambulation-independent-transfer",
  );
  expect(contradiction?.kind).toBe("contradiction");
  expect(contradiction?.itemCode).toBe("M1860");
  expect(contradiction?.resolved).toBe(false);
  // Unanswered functional items persist as missing warnings; answered ones don't.
  expect(flags.some((flag) => flag.ruleId === "missing-functional:M1800")).toBe(true);
  expect(flags.some((flag) => flag.ruleId === "missing-functional:M1860")).toBe(false);
  // Blockers never persist — filing would have aborted first.
  expect(flags.some((flag) => flag.ruleId === "missing-primary-diagnosis")).toBe(false);

  await cleanupQualityFixture(fixture);
});

test("an unacceptable primary still files — surfaced as primaryAcceptable, never a gate", async () => {
  const fixture = await seedQualityFixture();
  await patch(`/assessments/${fixture.assessmentId}/codings`, {
    diagnosisId: fixture.diagnosisId,
    icd10Code: "M17.9", // return-to-provider as principal in the CY2025 grouper
    isPrimary: true,
    updatedAt: new Date().toISOString(),
  });

  const pdgmRes = await get(`/assessments/${fixture.assessmentId}/pdgm`);
  expect(pdgmRes.status).toBe(200);
  const pdgm = (await pdgmRes.json()) as { clinicalGroup: string; primaryAcceptable: boolean };
  expect(pdgm.clinicalGroup).toBe("MMTA_OTHER");
  expect(pdgm.primaryAcceptable).toBe(false);

  const res = await postJson(`/assessments/${fixture.assessmentId}/complete`, {
    timing: "early",
    admissionSource: "community",
  });
  expect(res.status).toBe(200);
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.completedAt).not.toBeNull();

  await cleanupQualityFixture(fixture);
});

// completeAssessment is write-once, so the reconcile-on-refile branch is exercised directly
// (like the extractAnswers/suggestCoding direct-call tests above).
test("persistQualityFlags resolves stale flags but never touches other rule-id namespaces", async () => {
  const fixture = await seedQualityFixture();
  await db.transaction((tx) =>
    persistQualityFlags(tx, fixture.assessmentId, [
      {
        ruleId: "contradiction-bedfast-ambulation-independent-transfer",
        kind: "contradiction",
        severity: "warning",
        itemCode: "M1860",
        message: "contradictory",
      },
    ]),
  );
  await db.insert(qualityFlags).values({
    assessmentId: fixture.assessmentId,
    ruleId: "review:general",
    kind: "missing",
    message: "a reviewer note outside the deterministic rule set",
    resolved: false,
    updatedAt: new Date(),
  });

  await db.transaction((tx) => persistQualityFlags(tx, fixture.assessmentId, []));

  const flags = await db
    .select({ ruleId: qualityFlags.ruleId, resolved: qualityFlags.resolved })
    .from(qualityFlags)
    .where(eq(qualityFlags.assessmentId, fixture.assessmentId));
  expect(
    flags.find((flag) => flag.ruleId === "contradiction-bedfast-ambulation-independent-transfer")
      ?.resolved,
  ).toBe(true);
  expect(flags.find((flag) => flag.ruleId === "review:general")?.resolved).toBe(false);

  await cleanupQualityFixture(fixture);
});

// Review pages: the main fixture is filed by now (pending_review), so the queue and
// detail render from it; the Return flow gets its own fixture so Approve can stay terminal.

test("GET /visits/:id carries the reviewStatus set at file time", async () => {
  const res = await get(`/visits/${visitId}`);
  const body = visitDetailSchema.parse(await res.json());
  expect(body.assessment?.reviewStatus).toBe("pending_review");
});

test("GET /review -> 200 HTML listing the filed assessment", async () => {
  const res = await get("/review");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const body = await res.text();
  expect(body).toContain(assessmentId);
  expect(body).toContain("Test Patient");
});

test("GET /review/:assessmentId -> 200 HTML with the coding, answers, and frozen case-mix weight", async () => {
  const res = await get(`/review/${assessmentId}`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const body = await res.text();
  expect(body).toContain("J45.909"); // the coded primary (asthma)
  expect(body).toContain("M1830"); // an answered OASIS item
  const detail = await getAssessment(db, assessmentId);
  expect(body).toContain(String(detail?.pdgmSnapshot?.caseMixWeight));
});

test("GET /review/:assessmentId -> 404 for an unknown assessment", async () => {
  const res = await get("/review/11111111-1111-1111-1111-111111111111");
  expect(res.status).toBe(404);
});

test("POST /review/:id/approve -> 403 for a non-reviewer userId, leaving the status untouched", async () => {
  const res = await postForm(`/review/${assessmentId}/approve`, [["userId", crypto.randomUUID()]]);
  expect(res.status).toBe(403);
  const [row] = await db
    .select({ reviewStatus: assessments.reviewStatus })
    .from(assessments)
    .where(eq(assessments.id, assessmentId));
  expect(row?.reviewStatus).toBe("pending_review");
});

test("POST /review/:id/return -> 422 with no flagged items and no message", async () => {
  const res = await postForm(`/review/${assessmentId}/return`, []);
  expect(res.status).toBe(422);
  const [row] = await db
    .select({ completedAt: assessments.completedAt, reviewStatus: assessments.reviewStatus })
    .from(assessments)
    .where(eq(assessments.id, assessmentId));
  expect(row?.completedAt).not.toBeNull();
  expect(row?.reviewStatus).toBe("pending_review");
});

test("POST /review/:id/approve -> redirect, approved status, accepted audit row, out of the queue", async () => {
  const res = await postForm(`/review/${assessmentId}/approve`, []);
  expect([302, 303]).toContain(res.status);
  expect(res.headers.get("location")).toBe("/review");

  const [row] = await db
    .select({ reviewStatus: assessments.reviewStatus, completedAt: assessments.completedAt })
    .from(assessments)
    .where(eq(assessments.id, assessmentId));
  expect(row?.reviewStatus).toBe("approved");
  expect(row?.completedAt).not.toBeNull();

  // Assessment-level events only (itemCode null): per-item rows belong to provenance.
  const audits = await db
    .select({ event: auditLogs.event, actorId: auditLogs.actorId })
    .from(auditLogs)
    .where(and(eq(auditLogs.assessmentId, assessmentId), isNull(auditLogs.itemCode)));
  expect(audits).toHaveLength(1);
  expect(audits[0]?.event).toBe("accepted");
  expect(audits[0]?.actorId).toBe(DEFAULT_REVIEWER_ID);

  const queueBody = await (await get("/review")).text();
  expect(queueBody).not.toContain(assessmentId);
});

// The Return flow chains across tests on one fixture: file -> return -> pull -> edit ->
// refile -> re-return -> note-only return, cleaned up at the end of the chain.
let returnFixture: Awaited<ReturnType<typeof seedQualityFixture>>;
let pullCursorBeforeReturn: number;
let returnedFlagId: string;

const fileReturnFixture = async () => {
  const res = await postJson(`/assessments/${returnFixture.assessmentId}/complete`, {
    timing: "early",
    admissionSource: "community",
  });
  expect(res.status).toBe(200);
};

test("POST /review/:id/return -> redirect; flag written, assessment reopened, visit reopened", async () => {
  returnFixture = await seedQualityFixture();
  await patch(`/assessments/${returnFixture.assessmentId}/codings`, {
    diagnosisId: returnFixture.diagnosisId,
    icd10Code: "I10",
    isPrimary: true,
    updatedAt: new Date().toISOString(),
  });
  await fileReturnFixture();

  pullCursorBeforeReturn = (await pull(db, 0)).cursor;

  const res = await postForm(`/review/${returnFixture.assessmentId}/return`, [
    ["flagItem", "M1830"],
    ["message", "Bathing looks understated against the transcript."],
  ]);
  expect([302, 303]).toContain(res.status);

  const flags = await db
    .select()
    .from(qualityFlags)
    .where(eq(qualityFlags.assessmentId, returnFixture.assessmentId));
  const reviewFlag = flags.find((flag) => flag.ruleId === "review:M1830");
  expect(reviewFlag?.itemCode).toBe("M1830");
  expect(reviewFlag?.kind).toBe("nurse_vs_ai");
  expect(reviewFlag?.message).toBe("Reviewer flagged M1830 for another look.");
  expect(reviewFlag?.resolved).toBe(false);
  returnedFlagId = reviewFlag!.id;
  const generalFlag = flags.find((flag) => flag.ruleId === "review:general");
  expect(generalFlag?.itemCode).toBeNull();
  expect(generalFlag?.message).toBe("Bathing looks understated against the transcript.");

  const [assessmentAfter] = await db
    .select({ reviewStatus: assessments.reviewStatus, completedAt: assessments.completedAt })
    .from(assessments)
    .where(eq(assessments.id, returnFixture.assessmentId));
  expect(assessmentAfter?.reviewStatus).toBe("returned");
  expect(assessmentAfter?.completedAt).toBeNull();
  const [visitAfter] = await db
    .select({ status: visits.status })
    .from(visits)
    .where(eq(visits.id, returnFixture.visitId));
  expect(visitAfter?.status).toBe("open");
});

test("sync pull surfaces the returned flag and the reopened assessment", async () => {
  const { changes, cursor } = await pull(db, pullCursorBeforeReturn);
  expect(cursor).toBeGreaterThan(pullCursorBeforeReturn);
  const pulledFlags = changes.quality_flags as { id: string }[];
  expect(pulledFlags.some((flag) => flag.id === returnedFlagId)).toBe(true);
  const pulledAssessment = (
    changes.assessments as { id: string; completedAt: Date | null; reviewStatus: string | null }[]
  ).find((row) => row.id === returnFixture.assessmentId);
  expect(pulledAssessment?.reviewStatus).toBe("returned");
  expect(pulledAssessment?.completedAt).toBeNull();
});

test("a return reopens editing: PATCH /answers succeeds again", async () => {
  const res = await patch(`/assessments/${returnFixture.assessmentId}/answers`, {
    answers: [{ itemCode: "M1830", value: "3", updatedAt: new Date().toISOString() }],
  });
  expect(res.status).toBe(200);
});

test("refiling after a return sets pending_review and re-enters the queue", async () => {
  await fileReturnFixture();
  const [row] = await db
    .select({ reviewStatus: assessments.reviewStatus, completedAt: assessments.completedAt })
    .from(assessments)
    .where(eq(assessments.id, returnFixture.assessmentId));
  expect(row?.reviewStatus).toBe("pending_review");
  expect(row?.completedAt).not.toBeNull();
  const queueBody = await (await get("/review")).text();
  expect(queueBody).toContain(returnFixture.assessmentId);
});

test("a repeat return on the same item updates the existing flag instead of duplicating it", async () => {
  const res = await postForm(`/review/${returnFixture.assessmentId}/return`, [
    ["flagItem", "M1830"],
    ["message", "Still understated after the edit."],
  ]);
  expect([302, 303]).toContain(res.status);
  const flags = await db
    .select()
    .from(qualityFlags)
    .where(eq(qualityFlags.assessmentId, returnFixture.assessmentId));
  const reviewFlags = flags.filter((flag) => flag.ruleId === "review:M1830");
  expect(reviewFlags).toHaveLength(1);
  expect(reviewFlags[0]?.id).toBe(returnedFlagId);
  expect(reviewFlags[0]?.message).toBe("Reviewer flagged M1830 for another look.");
  expect(reviewFlags[0]?.resolved).toBe(false);
  const generalFlags = flags.filter((flag) => flag.ruleId === "review:general");
  expect(generalFlags).toHaveLength(1);
  expect(generalFlags[0]?.message).toBe("Still understated after the edit.");
});

test("a return with only a note synthesizes one general flag", async () => {
  await fileReturnFixture();
  const res = await postForm(`/review/${returnFixture.assessmentId}/return`, [
    ["message", "Overall documentation needs more detail."],
  ]);
  expect([302, 303]).toContain(res.status);
  const flags = await db
    .select()
    .from(qualityFlags)
    .where(eq(qualityFlags.assessmentId, returnFixture.assessmentId));
  const generalFlag = flags.find((flag) => flag.ruleId === "review:general");
  expect(generalFlag?.itemCode).toBeNull();
  expect(generalFlag?.kind).toBe("missing");
  expect(generalFlag?.message).toBe("Overall documentation needs more detail.");

  await cleanupQualityFixture(returnFixture);
});

test("approve, return, and the detail page all refuse a never-filed draft", async () => {
  const draftFixture = await seedQualityFixture();
  const detailRes = await get(`/review/${draftFixture.assessmentId}`);
  expect(detailRes.status).toBe(404);
  const approveRes = await postForm(`/review/${draftFixture.assessmentId}/approve`, []);
  expect(approveRes.status).toBe(422);
  const returnRes = await postForm(`/review/${draftFixture.assessmentId}/return`, [
    ["message", "cannot return a draft"],
  ]);
  expect(returnRes.status).toBe(422);
  await cleanupQualityFixture(draftFixture);
});

// Transcript persistence and snippet offsets, on throwaway fixtures so the drafts and audit
// state the provenance tests above rely on stay untouched.

test("extractAnswers persists the transcript and getAssessment returns it", async () => {
  const fixture = await seedQualityFixture();
  const transcriptText = "Patient reports she grooms self without assistance each morning.";
  await extractAnswers(db, fixture.assessmentId, transcriptText, async () => [
    { itemCode: "M1800", value: "0", transcriptSnippet: "grooms self", confidence: 0.9 },
  ]);
  const transcriptRows = await db
    .select({ text: assessmentTranscripts.text })
    .from(assessmentTranscripts)
    .where(eq(assessmentTranscripts.assessmentId, fixture.assessmentId));
  expect(transcriptRows).toHaveLength(1);
  expect(transcriptRows[0]?.text).toBe(transcriptText);
  const detail = await getAssessment(db, fixture.assessmentId);
  expect(detail?.transcript).toBe(transcriptText);
  await cleanupQualityFixture(fixture);
});

test("extractAnswers stores snippet offsets that slice back to the quoted phrase", async () => {
  const fixture = await seedQualityFixture();
  const transcriptText = "Needs help bathing but grooms self without any assistance.";
  await extractAnswers(db, fixture.assessmentId, transcriptText, async () => [
    { itemCode: "M1800", value: "0", transcriptSnippet: "grooms self", confidence: 0.9 },
  ]);
  const detail = await getAssessment(db, fixture.assessmentId);
  const m1800Suggestion = detail?.suggestions.find((suggestion) => suggestion.itemCode === "M1800");
  expect(m1800Suggestion?.snippetStart).not.toBeNull();
  expect(m1800Suggestion?.snippetEnd).not.toBeNull();
  expect(transcriptText.slice(m1800Suggestion!.snippetStart!, m1800Suggestion!.snippetEnd!)).toBe(
    "grooms self",
  );
  await cleanupQualityFixture(fixture);
});

test("extractAnswers stores null offsets for a snippet missing from the transcript", async () => {
  const fixture = await seedQualityFixture();
  await extractAnswers(db, fixture.assessmentId, "a short visit note", async () => [
    {
      itemCode: "M1800",
      value: "0",
      transcriptSnippet: "paraphrased, never spoken",
      confidence: 0.9,
    },
  ]);
  const detail = await getAssessment(db, fixture.assessmentId);
  const m1800Suggestion = detail?.suggestions.find((suggestion) => suggestion.itemCode === "M1800");
  expect(m1800Suggestion?.snippetStart).toBeNull();
  expect(m1800Suggestion?.snippetEnd).toBeNull();
  await cleanupQualityFixture(fixture);
});

test("a re-extract replaces the transcript in place and bumps its server_seq", async () => {
  const fixture = await seedQualityFixture();
  await extractAnswers(db, fixture.assessmentId, "first visit note", async () => []);
  const [firstRow] = await db
    .select({ serverSeq: assessmentTranscripts.serverSeq })
    .from(assessmentTranscripts)
    .where(eq(assessmentTranscripts.assessmentId, fixture.assessmentId));
  await extractAnswers(db, fixture.assessmentId, "second visit note", async () => []);
  const transcriptRows = await db
    .select({ text: assessmentTranscripts.text, serverSeq: assessmentTranscripts.serverSeq })
    .from(assessmentTranscripts)
    .where(eq(assessmentTranscripts.assessmentId, fixture.assessmentId));
  expect(transcriptRows).toHaveLength(1);
  expect(transcriptRows[0]?.text).toBe("second visit note");
  expect(transcriptRows[0]?.serverSeq).toBeGreaterThan(firstRow!.serverSeq);
  await cleanupQualityFixture(fixture);
});

test("sync pull includes assessment assessmentTranscripts and a re-extract advances the cursor", async () => {
  const fixture = await seedQualityFixture();
  await extractAnswers(db, fixture.assessmentId, "initial visit note", async () => []);
  const { cursor: cursorBeforeReExtract } = await pull(db, 0);
  await extractAnswers(db, fixture.assessmentId, "revised visit note", async () => []);
  const { changes, cursor } = await pull(db, cursorBeforeReExtract);
  expect(cursor).toBeGreaterThan(cursorBeforeReExtract);
  const pulledTranscripts = changes.assessment_transcripts as {
    assessmentId: string;
    text: string;
  }[];
  expect(
    pulledTranscripts.some(
      (row) => row.assessmentId === fixture.assessmentId && row.text === "revised visit note",
    ),
  ).toBe(true);
  await cleanupQualityFixture(fixture);
});

test("getAssessment returns a null transcript before any extraction", async () => {
  const fixture = await seedQualityFixture();
  const detail = await getAssessment(db, fixture.assessmentId);
  expect(detail?.transcript).toBeNull();
  await cleanupQualityFixture(fixture);
});

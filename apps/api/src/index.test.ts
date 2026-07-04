import { afterAll, beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  answerSuggestions,
  assessmentAnswers,
  assessments,
  diagnoses,
  diagnosisCodings,
  diagnosisSuggestions,
  patients,
  visits,
} from "@ohmyscribe/db";
import {
  assessmentDetailSchema,
  codedDiagnosisSchema,
  visitDetailSchema,
  visitListItemSchema,
} from "@ohmyscribe/shared";
import { z } from "zod";
import { db } from "./db.ts";
import { extractAnswers } from "./answer-suggestions.ts";
import { getAssessment } from "./assessments.ts";
import { selectPicks, suggestCoding } from "./diagnosis-suggestions.ts";
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

test("POST /assessments/:id/complete -> 200, sets completedAt", async () => {
  const res = await postJson(`/assessments/${assessmentId}/complete`, {
    timing: "early",
    admissionSource: "community",
  });
  expect(res.status).toBe(200);
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.completedAt).not.toBeNull();
  completedAt = body.completedAt;
});

test("POST /assessments/:id/complete is write-once (repeat keeps the original timestamp)", async () => {
  const res = await postJson(`/assessments/${assessmentId}/complete`, {
    timing: "early",
    admissionSource: "community",
  });
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.completedAt).toBe(completedAt);
});

test("GET /pdgm returns the frozen snapshot once complete, ignoring the toggle", async () => {
  const res = await get(`/assessments/${assessmentId}/pdgm?admissionSource=institutional`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { admissionSource: string };
  // Filed with community; the snapshot stays community even when queried institutional.
  expect(body.admissionSource).toBe("community");
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

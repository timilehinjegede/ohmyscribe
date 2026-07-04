import { afterAll, beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  assessmentAnswers,
  assessments,
  diagnoses,
  diagnosisCodings,
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
  expect(coded.find((d) => d.diagnosisId === hypertensionId)?.suggestion?.icd10).toBe("I10");
  // "111" is not in the crosswalk -> no suggestion
  expect(coded.find((d) => d.code === "111")?.suggestion).toBeNull();
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
  const coded = z.array(codedDiagnosisSchema).parse(
    await (await get(`/assessments/${assessmentId}/diagnoses`)).json(),
  );
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

test("GET /visits/:id reflects the assessment summary (answered, not yet complete)", async () => {
  const res = await get(`/visits/${visitId}`);
  const body = visitDetailSchema.parse(await res.json());
  expect(body.assessment).not.toBeNull();
  expect(body.assessment?.completedAt).toBeNull();
  expect(body.assessment?.answeredCount).toBeGreaterThan(0);
  expect(body.assessment?.codedCount).toBeGreaterThan(0);
});

test("POST /assessments/:id/complete -> 200, sets completedAt", async () => {
  const res = await post(`/assessments/${assessmentId}/complete`);
  expect(res.status).toBe(200);
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.completedAt).not.toBeNull();
  completedAt = body.completedAt;
});

test("POST /assessments/:id/complete is write-once (repeat keeps the original timestamp)", async () => {
  const res = await post(`/assessments/${assessmentId}/complete`);
  const body = assessmentDetailSchema.parse(await res.json());
  expect(body.completedAt).toBe(completedAt);
});

test("POST /assessments/:id/complete -> 404 for an unknown assessment", async () => {
  const res = await post("/assessments/11111111-1111-1111-1111-111111111111/complete");
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
  const coded = z.array(codedDiagnosisSchema).parse(
    await (await get(`/assessments/${assessmentId}/diagnoses`)).json(),
  );
  expect(coded.find((d) => d.diagnosisId === asthmaId)?.coding?.isPrimary).toBe(true);
});

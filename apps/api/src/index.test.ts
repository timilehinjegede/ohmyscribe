import { afterAll, beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { assessmentAnswers, assessments, diagnoses, patients, visits } from "@ohmyscribe/db";
import { assessmentDetailSchema, visitDetailSchema, visitListItemSchema } from "@ohmyscribe/shared";
import { z } from "zod";
import { db } from "./db.ts";
import server from "./index.ts";

// Integration tests: they hit the real Postgres (DATABASE_URL must be set) via the
// app's own pool, seeding a throwaway patient/visit and cleaning it up after.
let patientId: string;
let visitId: string;
let assessmentId: string;
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
});

afterAll(async () => {
  // assessment rows FK the visit — remove them before the visit.
  const rows = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.visitId, visitId));
  for (const row of rows) {
    await db.delete(assessmentAnswers).where(eq(assessmentAnswers.assessmentId, row.id));
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
  expect(body.diagnoses).toHaveLength(1);
  expect(body.diagnoses[0]?.display).toBe("Anemia (disorder)");
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

test("GET /visits/:id reflects the assessment summary (answered, not yet complete)", async () => {
  const res = await get(`/visits/${visitId}`);
  const body = visitDetailSchema.parse(await res.json());
  expect(body.assessment).not.toBeNull();
  expect(body.assessment?.completedAt).toBeNull();
  expect(body.assessment?.answeredCount).toBeGreaterThan(0);
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

import { afterAll, beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { diagnoses, patients, visits } from "@ohmyscribe/db";
import { visitDetailSchema, visitListItemSchema } from "@ohmyscribe/shared";
import { z } from "zod";
import { db } from "./db.ts";
import server from "./index.ts";

// Integration tests: they hit the real Postgres (DATABASE_URL must be set) via the
// app's own pool, seeding a throwaway patient/visit and cleaning it up after.
let patientId: string;
let visitId: string;

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
  await db.delete(diagnoses).where(eq(diagnoses.visitId, visitId));
  await db.delete(visits).where(eq(visits.id, visitId));
  await db.delete(patients).where(eq(patients.id, patientId));
  await db.$client.end();
});

const get = (path: string) => server.fetch(new Request(`http://localhost${path}`));

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

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { upsertAnswersSchema } from "@ohmyscribe/shared";
import {
  completeAssessment,
  getAssessment,
  getOrCreateAssessment,
  upsertAnswers,
} from "./assessments.ts";
import { db } from "./db.ts";
import { getVisit, listVisits } from "./visits.ts";

const app = new Hono();

// Without this, a thrown error returns Hono's default plain-text 500.
app.onError((err, c) => {
  console.error("api error:", err);
  return c.json({ error: "internal" }, 500);
});

app.get("/health", (c) => c.json({ ok: true }));

app.get("/visits", async (c) => c.json(await listVisits(db)));

app.get(
  "/visits/:id",
  zValidator("param", z.object({ id: z.string().uuid() }), (result, c) => {
    if (!result.success) return c.json({ error: "invalid visit id" }, 400);
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const visit = await getVisit(db, id);
    if (!visit) return c.json({ error: "visit not found" }, 404);
    return c.json(visit);
  },
);

app.post(
  "/visits/:id/assessment",
  zValidator("param", z.object({ id: z.string().uuid() }), (result, c) => {
    if (!result.success) return c.json({ error: "invalid visit id" }, 400);
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const visit = await getVisit(db, id);
    if (!visit) return c.json({ error: "visit not found" }, 404);
    const assessment = await getOrCreateAssessment(db, id);
    return c.json(await getAssessment(db, assessment.id));
  },
);

app.patch(
  "/assessments/:id/answers",
  zValidator("param", z.object({ id: z.string().uuid() }), (result, c) => {
    if (!result.success) return c.json({ error: "invalid assessment id" }, 400);
  }),
  zValidator("json", upsertAnswersSchema, (result, c) => {
    if (!result.success) return c.json({ error: "invalid answers" }, 400);
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { answers } = c.req.valid("json");
    const assessment = await getAssessment(db, id);
    if (!assessment) return c.json({ error: "assessment not found" }, 404);
    if (assessment.completedAt) return c.json({ error: "assessment is complete" }, 409);
    await upsertAnswers(db, id, answers);
    return c.json(await getAssessment(db, id));
  },
);

app.post(
  "/assessments/:id/complete",
  zValidator("param", z.object({ id: z.string().uuid() }), (result, c) => {
    if (!result.success) return c.json({ error: "invalid assessment id" }, 400);
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const assessment = await getAssessment(db, id);
    if (!assessment) return c.json({ error: "assessment not found" }, 404);
    await completeAssessment(db, id);
    return c.json(await getAssessment(db, id));
  },
);

export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};

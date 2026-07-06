import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  ADMISSION_SOURCES,
  TIMINGS,
  completeRequestSchema,
  extractRequestSchema,
  syncPullQuerySchema,
  syncPushRequestSchema,
  upsertAnswersSchema,
  upsertCodingSchema,
} from "@ohmyscribe/shared";
import {
  completeAssessment,
  getAssessment,
  getOrCreateAssessment,
  upsertAnswers,
} from "./assessments.ts";
import { extractAnswers } from "./answer-suggestions.ts";
import { getCodedDiagnoses, removeCoding, upsertCoding } from "./diagnosis-codings.ts";
import { suggestCoding } from "./diagnosis-suggestions.ts";
import { computeAssessmentPdgm } from "./pdgm.ts";
import { pull, push } from "./sync.ts";
import { callCodingModel, callExtractModel, transcribeAudio } from "./openai.ts";
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
  "/sync/pull",
  zValidator("query", syncPullQuerySchema, (result, c) => {
    if (!result.success) return c.json({ error: "invalid cursor" }, 400);
  }),
  async (c) => {
    const { since } = c.req.valid("query");
    return c.json(await pull(db, since));
  },
);

app.post(
  "/sync/push",
  zValidator("json", syncPushRequestSchema, (result, c) => {
    if (!result.success) return c.json({ error: "invalid push" }, 400);
  }),
  async (c) => {
    const { rows } = c.req.valid("json");
    return c.json({ results: await push(db, rows) });
  },
);

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
  "/assessments/:id/extract",
  zValidator("param", z.object({ id: z.string().uuid() }), (result, c) => {
    if (!result.success) return c.json({ error: "invalid assessment id" }, 400);
  }),
  zValidator("json", extractRequestSchema, (result, c) => {
    if (!result.success) return c.json({ error: "invalid transcript" }, 400);
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { transcript } = c.req.valid("json");
    const assessment = await getAssessment(db, id);
    if (!assessment) return c.json({ error: "assessment not found" }, 404);
    if (assessment.completedAt) return c.json({ error: "assessment is complete" }, 409);
    try {
      const drafted = await extractAnswers(db, id, transcript, callExtractModel);
      return c.json({ drafted });
    } catch (error) {
      // User-initiated, so surface the failure rather than swallow it (unlike suggest-coding).
      console.error("extract failed:", error);
      return c.json({ error: "extraction failed" }, 502);
    }
  },
);

app.post(
  "/assessments/:id/extract-audio",
  zValidator("param", z.object({ id: z.string().uuid() }), (result, c) => {
    if (!result.success) return c.json({ error: "invalid assessment id" }, 400);
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const audio = (await c.req.parseBody())["audio"];
    if (!(audio instanceof File)) return c.json({ error: "missing audio" }, 400);
    const assessment = await getAssessment(db, id);
    if (!assessment) return c.json({ error: "assessment not found" }, 404);
    if (assessment.completedAt) return c.json({ error: "assessment is complete" }, 409);
    try {
      const transcript = await transcribeAudio(audio);
      const drafted = await extractAnswers(db, id, transcript, callExtractModel);
      return c.json({ drafted });
    } catch (error) {
      console.error("audio extract failed:", error);
      return c.json({ error: "extraction failed" }, 502);
    }
  },
);

app.post(
  "/assessments/:id/complete",
  zValidator("param", z.object({ id: z.string().uuid() }), (result, c) => {
    if (!result.success) return c.json({ error: "invalid assessment id" }, 400);
  }),
  zValidator("json", completeRequestSchema, (result, c) => {
    if (!result.success) return c.json({ error: "invalid completion" }, 400);
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { timing, admissionSource } = c.req.valid("json");
    // Snapshot the grouping as it stands, then file it (assessment + visit) in one transaction.
    const pdgm = await computeAssessmentPdgm(db, id, timing, admissionSource);
    if (!pdgm) return c.json({ error: "assessment not found" }, 404);
    // Can't file without a primary diagnosis — it drives the clinical group.
    if (!pdgm.clinicalGroupDriver) {
      return c.json({ error: "a primary diagnosis is required to file" }, 422);
    }
    await completeAssessment(db, id, pdgm);
    return c.json(await getAssessment(db, id));
  },
);

app.get(
  "/assessments/:id/diagnoses",
  zValidator("param", z.object({ id: z.string().uuid() }), (result, c) => {
    if (!result.success) return c.json({ error: "invalid assessment id" }, 400);
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const coded = await getCodedDiagnoses(db, id);
    if (!coded) return c.json({ error: "assessment not found" }, 404);
    return c.json(coded);
  },
);

app.get(
  "/assessments/:id/pdgm",
  zValidator("param", z.object({ id: z.string().uuid() }), (result, c) => {
    if (!result.success) return c.json({ error: "invalid assessment id" }, 400);
  }),
  zValidator(
    "query",
    z.object({
      timing: z.enum(TIMINGS).default("early"),
      admissionSource: z.enum(ADMISSION_SOURCES).default("community"),
    }),
    (result, c) => {
      if (!result.success) return c.json({ error: "invalid timing or admission source" }, 400);
    },
  ),
  async (c) => {
    const { id } = c.req.valid("param");
    const assessment = await getAssessment(db, id);
    if (!assessment) return c.json({ error: "assessment not found" }, 404);
    // Completed → the frozen snapshot; draft → live compute with the client's toggle.
    if (assessment.completedAt && assessment.pdgmSnapshot) {
      return c.json(assessment.pdgmSnapshot);
    }
    const { timing, admissionSource } = c.req.valid("query");
    const pdgm = await computeAssessmentPdgm(db, id, timing, admissionSource);
    if (!pdgm) return c.json({ error: "assessment not found" }, 404);
    return c.json(pdgm);
  },
);

app.post(
  "/assessments/:id/suggest-coding",
  zValidator("param", z.object({ id: z.string().uuid() }), (result, c) => {
    if (!result.success) return c.json({ error: "invalid assessment id" }, 400);
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const assessment = await getAssessment(db, id);
    if (!assessment) return c.json({ error: "assessment not found" }, 404);
    // Fire-and-forget: the client refetches the coded view (GET /diagnoses); no need to recompute it.
    await suggestCoding(db, id, callCodingModel);
    return c.json({ ok: true });
  },
);

app.patch(
  "/assessments/:id/codings",
  zValidator("param", z.object({ id: z.string().uuid() }), (result, c) => {
    if (!result.success) return c.json({ error: "invalid assessment id" }, 400);
  }),
  zValidator("json", upsertCodingSchema, (result, c) => {
    if (!result.success) return c.json({ error: "invalid coding" }, 400);
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const coding = c.req.valid("json");
    const assessment = await getAssessment(db, id);
    if (!assessment) return c.json({ error: "assessment not found" }, 404);
    if (assessment.completedAt) return c.json({ error: "assessment is complete" }, 409);
    const ok = await upsertCoding(db, id, coding);
    if (!ok) return c.json({ error: "diagnosis not in this assessment" }, 422);
    return c.json(await getCodedDiagnoses(db, id));
  },
);

app.delete(
  "/assessments/:id/codings/:diagnosisId",
  zValidator(
    "param",
    z.object({ id: z.string().uuid(), diagnosisId: z.string().uuid() }),
    (result, c) => {
      if (!result.success) return c.json({ error: "invalid id" }, 400);
    },
  ),
  zValidator("json", z.object({ updatedAt: z.string().datetime() }), (result, c) => {
    if (!result.success) return c.json({ error: "invalid body" }, 400);
  }),
  async (c) => {
    const { id, diagnosisId } = c.req.valid("param");
    const { updatedAt } = c.req.valid("json");
    const assessment = await getAssessment(db, id);
    if (!assessment) return c.json({ error: "assessment not found" }, 404);
    if (assessment.completedAt) return c.json({ error: "assessment is complete" }, 409);
    await removeCoding(db, id, diagnosisId, updatedAt);
    return c.json(await getCodedDiagnoses(db, id));
  },
);

export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};

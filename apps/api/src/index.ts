import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
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

export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};

import { z } from "zod";

import { oasisAnswerSchema } from "./oasis/index.ts";

// Lenient on purpose: a strict catalog check would fail reads once an item leaves the catalog.
export const assessmentAnswerSchema = z.object({
  itemCode: z.string(),
  value: z.string(),
});
export type AssessmentAnswer = z.infer<typeof assessmentAnswerSchema>;

export const assessmentDetailSchema = z.object({
  id: z.string(),
  visitId: z.string(),
  completedAt: z.string().nullable(),
  answers: z.array(assessmentAnswerSchema),
});
export type AssessmentDetail = z.infer<typeof assessmentDetailSchema>;

// updatedAt is the device clock the server uses for last-write-wins when autosaves race.
export const upsertAnswerSchema = oasisAnswerSchema.and(
  z.object({ updatedAt: z.string().datetime() }),
);
export const upsertAnswersSchema = z.object({
  answers: z.array(upsertAnswerSchema),
});
export type UpsertAnswers = z.infer<typeof upsertAnswersSchema>;

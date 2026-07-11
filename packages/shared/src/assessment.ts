import { z } from "zod";

import { oasisAnswerSchema } from "./oasis/index.ts";
import { ADMISSION_SOURCES, TIMINGS, type PdgmResult } from "./pdgm/index.ts";

// Lenient on purpose: a strict catalog check would fail reads once an item leaves the catalog.
export const assessmentAnswerSchema = z.object({
  itemCode: z.string(),
  value: z.string(),
});
export type AssessmentAnswer = z.infer<typeof assessmentAnswerSchema>;

// The AI's drafted answer for an item, from /extract; the nurse accepts (saves it) or overrides.
export const answerSuggestionSchema = z.object({
  itemCode: z.string(),
  value: z.string(),
  transcriptSnippet: z.string().nullable(),
  snippetStart: z.number().int().nullable(),
  snippetEnd: z.number().int().nullable(),
  confidence: z.number().nullable(),
});
export type AnswerSuggestion = z.infer<typeof answerSuggestionSchema>;

export const assessmentDetailSchema = z.object({
  id: z.string(),
  visitId: z.string(),
  completedAt: z.string().nullable(),
  pdgmSnapshot: z.custom<PdgmResult>().nullable(),
  transcript: z.string().nullable(),
  answers: z.array(assessmentAnswerSchema),
  suggestions: z.array(answerSuggestionSchema),
});
export type AssessmentDetail = z.infer<typeof assessmentDetailSchema>;

export const extractRequestSchema = z.object({
  transcript: z.string().min(1).max(20000),
});

export const completeRequestSchema = z.object({
  timing: z.enum(TIMINGS),
  admissionSource: z.enum(ADMISSION_SOURCES),
});

// updatedAt is the device clock the server uses for last-write-wins when autosaves race.
export const upsertAnswerSchema = oasisAnswerSchema.and(
  z.object({ updatedAt: z.string().datetime() }),
);
export const upsertAnswersSchema = z.object({
  answers: z.array(upsertAnswerSchema),
});
export type UpsertAnswers = z.infer<typeof upsertAnswersSchema>;

import { z } from "zod";

import { diagnosisSummarySchema } from "./diagnosis.ts";
import { patientSummarySchema } from "./patient.ts";

export const visitSummarySchema = z.object({
  id: z.string(),
  patientId: z.string(),
  assignedUserId: z.string().nullable(),
  type: z.string(),
  status: z.string(),
  scheduledAt: z.string().nullable(),
});
export type VisitSummary = z.infer<typeof visitSummarySchema>;

export const visitListItemSchema = visitSummarySchema.extend({
  patientName: z.string().nullable(),
});
export type VisitListItem = z.infer<typeof visitListItemSchema>;

export const assessmentSummarySchema = z.object({
  id: z.string(),
  answeredCount: z.number(),
  codedCount: z.number(),
  completedAt: z.string().nullable(),
});

export const visitDetailSchema = visitSummarySchema.extend({
  patient: patientSummarySchema.nullable(),
  diagnoses: z.array(diagnosisSummarySchema),
  assessment: assessmentSummarySchema.nullable(),
});
export type VisitDetail = z.infer<typeof visitDetailSchema>;

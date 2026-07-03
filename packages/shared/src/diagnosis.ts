import { z } from "zod";

export const diagnosisSummarySchema = z.object({
  id: z.string(),
  system: z.string(),
  code: z.string(),
  display: z.string().nullable(),
});
export type DiagnosisSummary = z.infer<typeof diagnosisSummarySchema>;

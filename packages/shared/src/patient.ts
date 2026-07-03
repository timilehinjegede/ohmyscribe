import { z } from "zod";

export const patientSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  dob: z.string().nullable(),
  address: z.string().nullable(),
  referringPhysician: z.string().nullable(),
});
export type PatientSummary = z.infer<typeof patientSummarySchema>;

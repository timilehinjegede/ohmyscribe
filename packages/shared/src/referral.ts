import { z } from "zod";

export const diagnosisSchema = z.object({
  system: z.string(),
  code: z.string().min(1),
  display: z.string().optional(),
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;

// The validation gate: a referral that fails here is rejected, not ingested.
export const normalizedReferralSchema = z.object({
  externalId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dob: z.string().date(),
  address: z.string().optional(),
  referringPhysician: z.string().optional(),
  diagnoses: z.array(diagnosisSchema),
});
export type NormalizedReferral = z.infer<typeof normalizedReferralSchema>;

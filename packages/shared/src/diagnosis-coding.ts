import { z } from "zod";

import { isKnownIcd10, isValidIcd10Format } from "./icd10/index.ts";

// The nurse codes from the crosswalk's suggestions, so a well-formed but off-allowlist code
// is rejected too, not just malformed input.
export const icd10CodeSchema = z
  .string()
  .refine(isValidIcd10Format, "malformed ICD-10-CM code")
  .refine(isKnownIcd10, "unknown ICD-10-CM code");

// suggestion is the crosswalk's proposal; coding is what the nurse confirmed (null until then).
export const codedDiagnosisSchema = z.object({
  diagnosisId: z.string(),
  system: z.string(),
  code: z.string(),
  display: z.string().nullable(),
  onset: z.string().nullable(),
  suggestion: z
    .object({
      icd10: z.string(),
      display: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
    })
    .nullable(),
  coding: z.object({ icd10Code: z.string(), isPrimary: z.boolean() }).nullable(),
});
export type CodedDiagnosis = z.infer<typeof codedDiagnosisSchema>;

// updatedAt is the device clock the server uses for last-write-wins, as with answers.
export const upsertCodingSchema = z.object({
  diagnosisId: z.string().uuid(),
  icd10Code: icd10CodeSchema,
  isPrimary: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type UpsertCoding = z.infer<typeof upsertCodingSchema>;

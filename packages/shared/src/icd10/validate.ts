import { snomedToIcd10 } from "./crosswalk.ts";

// ICD-10-CM shape: a letter, two alphanumerics, then an optional 1–4 character decimal
// tail (I10, N18.30, T14.90XA). A format gate only — it does not prove the code exists.
const ICD10_CM = /^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/;
export const isValidIcd10Format = (code: string): boolean => ICD10_CM.test(code);

// The allowlist: every ICD-10 the crosswalk can produce. Our referral fixtures only use
// these, so a coded value outside the set is off-catalog and worth flagging. Kept as a Set
// for O(1) membership at the write path.
export const knownIcd10Codes: ReadonlySet<string> = new Set(
  Object.values(snomedToIcd10).map((mapping) => mapping.icd10),
);
export const isKnownIcd10 = (code: string): boolean => knownIcd10Codes.has(code);

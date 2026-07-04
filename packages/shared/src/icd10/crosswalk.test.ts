import { expect, test } from "bun:test";
import { icd10ForSnomed, snomedToIcd10 } from "./crosswalk.ts";
import { isKnownIcd10, isValidIcd10Format, knownIcd10Codes } from "./validate.ts";

test("every crosswalk code is a well-formed ICD-10-CM code", () => {
  for (const mapping of Object.values(snomedToIcd10)) {
    expect(isValidIcd10Format(mapping.icd10), mapping.icd10).toBe(true);
  }
});

test("isValidIcd10Format: accepts real codes, rejects malformed", () => {
  for (const code of ["I10", "N18.30", "T14.90XA", "G40.909", "E11.29"]) {
    expect(isValidIcd10Format(code), code).toBe(true);
  }
  for (const bad of ["hello", "123", "I1", "I10.", "n18.30", ""]) {
    expect(isValidIcd10Format(bad), bad).toBe(false);
  }
});

test("isKnownIcd10: the allowlist is exactly the crosswalk's codes", () => {
  expect(isKnownIcd10("I10")).toBe(true); // essential hypertension is in the crosswalk
  expect(isKnownIcd10("Z00.00")).toBe(false); // well-formed but off-catalog
  expect(knownIcd10Codes.size).toBeGreaterThan(0);
});

test("icd10ForSnomed: maps known concepts, null otherwise", () => {
  expect(icd10ForSnomed("59621000")?.icd10).toBe("I10"); // essential hypertension
  expect(icd10ForSnomed("433144002")?.icd10).toBe("N18.30"); // CKD stage 3, billable form
  expect(icd10ForSnomed("00000000")).toBeNull();
});

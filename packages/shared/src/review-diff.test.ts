import { expect, test } from "bun:test";
import {
  answerDisagrees,
  countAnswerDisagreements,
  countDiagnosisDisagreements,
  reviewDiffSummary,
} from "./review-diff.ts";

const diagnosis = (
  suggestionIsPrimary: boolean | null,
  codingIsPrimary: boolean | null,
): {
  suggestion: { isPrimary: boolean; rationale: null; confidence: null } | null;
  coding: { icd10Code: string; isPrimary: boolean } | null;
} => ({
  suggestion:
    suggestionIsPrimary === null
      ? null
      : { isPrimary: suggestionIsPrimary, rationale: null, confidence: null },
  coding: codingIsPrimary === null ? null : { icd10Code: "I10", isPrimary: codingIsPrimary },
});

test("a coding matching the suggested role is not a disagreement", () => {
  expect(countDiagnosisDisagreements([diagnosis(true, true), diagnosis(false, false)])).toBe(0);
});

test("a suggested primary coded as secondary is a disagreement", () => {
  expect(countDiagnosisDisagreements([diagnosis(true, false)])).toBe(1);
});

test("a suggestion with no coding at all is a disagreement", () => {
  expect(countDiagnosisDisagreements([diagnosis(true, null)])).toBe(1);
});

test("no suggestion means no disagreement, coded or not", () => {
  expect(countDiagnosisDisagreements([diagnosis(null, true), diagnosis(null, null)])).toBe(0);
});

test("an answer matching the suggested value is not a disagreement", () => {
  const answers = [{ itemCode: "M1830", value: "2" }];
  const suggestions = [{ itemCode: "M1830", value: "2" }];
  expect(countAnswerDisagreements(answers, suggestions)).toBe(0);
});

test("an answer differing from the suggested value is a disagreement", () => {
  const answers = [{ itemCode: "M1830", value: "3" }];
  const suggestions = [{ itemCode: "M1830", value: "2" }];
  expect(countAnswerDisagreements(answers, suggestions)).toBe(1);
});

test("a suggested item the nurse never answered is a disagreement", () => {
  const suggestions = [{ itemCode: "M1830", value: "2" }];
  expect(countAnswerDisagreements([], suggestions)).toBe(1);
  expect(answerDisagrees(undefined, "2")).toBe(true);
});

test("an answer with no suggestion is ignored", () => {
  const answers = [{ itemCode: "M1850", value: "1" }];
  expect(countAnswerDisagreements(answers, [])).toBe(0);
});

test("reviewDiffSummary totals both disagreement kinds", () => {
  const summary = reviewDiffSummary(
    [diagnosis(true, false), diagnosis(false, false)],
    [{ itemCode: "M1830", value: "3" }],
    [
      { itemCode: "M1830", value: "2" },
      { itemCode: "M1850", value: "1" },
    ],
  );
  expect(summary.diagnosisDisagreements).toBe(1);
  expect(summary.answerDisagreements).toBe(2);
  expect(summary.total).toBe(3);
});

import { expect, test } from "bun:test";
import { computePdgm, type PdgmInput } from "./calculator.ts";
import { diffPdgm } from "./diff.ts";

const base = { timing: "early", admissionSource: "community" } as const;

const cardiac = (answers: Record<string, string>): PdgmInput => ({
  ...base,
  primaryIcd10: "I50.9",
  secondaryIcd10s: [],
  answers,
});

test("a bathing answer that crosses the medium→high cutoff moves level and payment up", () => {
  // MMTA_CARDIAC: 32 points (medium) before, 47 (high, cutoff 41) after the M1830 change.
  const before = computePdgm(cardiac({ M1860: "4", M1820: "3", M1830: "2" }));
  const after = computePdgm(cardiac({ M1860: "4", M1820: "3", M1830: "6" }));
  expect(before.functional.level).toBe("medium");

  const delta = diffPdgm(before, after);
  expect(delta.functionalPointsDelta).toBe(15);
  expect(delta.functionalLevelChanged).toBe(true);
  expect(delta.functionalLevelBefore).toBe("medium");
  expect(delta.functionalLevelAfter).toBe("high");
  expect(delta.paymentDelta).toBeGreaterThan(0);
});

test("a points bump inside the same level moves points but not the payment", () => {
  // Both 3 and 10 points sit in the MMTA_CARDIAC low band, and the weight is keyed on the band.
  const before = computePdgm(cardiac({ M1830: "2" }));
  const after = computePdgm(cardiac({ M1830: "3" }));

  const delta = diffPdgm(before, after);
  expect(delta.functionalPointsDelta).toBe(7);
  expect(delta.functionalLevelChanged).toBe(false);
  expect(delta.paymentDelta).toBe(0);
});

test("a non-functional answer change is a zero delta on every axis", () => {
  const before = computePdgm(cardiac({ M1830: "2", M1700: "0" }));
  const after = computePdgm(cardiac({ M1830: "2", M1700: "3" }));

  const delta = diffPdgm(before, after);
  expect(delta.functionalPointsDelta).toBe(0);
  expect(delta.functionalLevelChanged).toBe(false);
  expect(delta.paymentDelta).toBe(0);
});

test("diffing in reverse negates the numeric deltas and swaps the before/after labels", () => {
  const before = computePdgm(cardiac({ M1860: "4", M1820: "3", M1830: "2" }));
  const after = computePdgm(cardiac({ M1860: "4", M1820: "3", M1830: "6" }));

  const forward = diffPdgm(before, after);
  const reverse = diffPdgm(after, before);
  expect(reverse.paymentDelta).toBe(-forward.paymentDelta);
  expect(reverse.functionalPointsDelta).toBe(-forward.functionalPointsDelta);
  expect(reverse.functionalLevelBefore).toBe(forward.functionalLevelAfter);
  expect(reverse.functionalLevelAfter).toBe(forward.functionalLevelBefore);
  expect(reverse.functionalLevelChanged).toBe(forward.functionalLevelChanged);
});

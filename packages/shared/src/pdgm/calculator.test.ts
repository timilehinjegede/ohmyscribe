import { expect, test } from "bun:test";
import { computePdgm, type PdgmInput } from "./calculator.ts";

const base = { timing: "early", admissionSource: "community" } as const;

test("heart failure primary + high functional impairment → MMTA_CARDIAC, high", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "I50.9",
    secondaryIcd10s: [],
    answers: { M1830: "6", M1860: "6", M1850: "5", M1033: "4" }, // 8 + 9 + 7 + 8 = 32
  });
  expect(result.clinicalGroup).toBe("MMTA_CARDIAC");
  expect(result.functional.points).toBe(32);
  expect(result.functional.level).toBe("high");
  expect(result.comorbidity.level).toBe("none");
});

test("COPD primary + low functional impairment → MMTA_RESPIRATORY, low", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "J44.9",
    secondaryIcd10s: [],
    answers: { M1800: "1", M1860: "1" }, // 2 + 2 = 4
  });
  expect(result.clinicalGroup).toBe("MMTA_RESPIRATORY");
  expect(result.functional.points).toBe(4);
  expect(result.functional.level).toBe("low");
});

test("osteoarthritis primary + medium functional → MS_REHAB, medium", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "M17.9",
    secondaryIcd10s: [],
    answers: { M1830: "3", M1860: "3", M1033: "1" }, // 6 + 6 + 2 = 14
  });
  expect(result.clinicalGroup).toBe("MS_REHAB");
  expect(result.functional.points).toBe(14);
  expect(result.functional.level).toBe("medium");
});

test("diabetes primary + CKD secondary → MMTA_ENDOCRINE, comorbidity low", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "E11.29",
    secondaryIcd10s: ["N18.4"],
    answers: { M1800: "1" },
  });
  expect(result.clinicalGroup).toBe("MMTA_ENDOCRINE");
  expect(result.comorbidity.level).toBe("low");
  expect(result.comorbidity.subgroups).toEqual(["Renal"]);
});

test("lung cancer primary → MMTA_INFECTIOUS", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "C34.90",
    secondaryIcd10s: [],
    answers: {},
  });
  expect(result.clinicalGroup).toBe("MMTA_INFECTIOUS");
});

test("out-of-fixture primary degrades to MMTA_OTHER but keeps the driver", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "Z00.00",
    secondaryIcd10s: [],
    answers: {},
  });
  expect(result.clinicalGroup).toBe("MMTA_OTHER");
  expect(result.clinicalGroupDriver).toBe("Z00.00");
});

test("no primary → MMTA_OTHER, null driver", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: null,
    secondaryIcd10s: [],
    answers: {},
  });
  expect(result.clinicalGroup).toBe("MMTA_OTHER");
  expect(result.clinicalGroupDriver).toBeNull();
});

test("functional level brackets the medium cutoff (11 → low, 12 → medium)", () => {
  const low = computePdgm({
    ...base,
    primaryIcd10: "I50.9",
    secondaryIcd10s: [],
    answers: { M1810: "3", M1820: "2", M1033: "1" }, // 5 + 4 + 2 = 11
  });
  expect(low.functional.points).toBe(11);
  expect(low.functional.level).toBe("low");

  const medium = computePdgm({
    ...base,
    primaryIcd10: "I50.9",
    secondaryIcd10s: [],
    answers: { M1820: "2", M1830: "3", M1033: "1" }, // 4 + 6 + 2 = 12
  });
  expect(medium.functional.points).toBe(12);
  expect(medium.functional.level).toBe("medium");
});

test("institutional admission raises the illustrative weight vs community", () => {
  const input: PdgmInput = {
    primaryIcd10: "I50.9",
    secondaryIcd10s: [],
    answers: { M1800: "1" },
    timing: "early",
    admissionSource: "community",
  };
  const community = computePdgm(input);
  const institutional = computePdgm({ ...input, admissionSource: "institutional" });
  expect(institutional.caseMixWeight).toBeGreaterThan(community.caseMixWeight);
});

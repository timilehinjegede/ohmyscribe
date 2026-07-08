import { expect, test } from "bun:test";
import { buildPdgmInput, computePdgm, type PdgmInput } from "./calculator.ts";

const base = { timing: "early", admissionSource: "community" } as const;

test("heart failure primary + high functional impairment → MMTA_CARDIAC, high, published weight", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "I50.9",
    secondaryIcd10s: [],
    answers: { M1830: "6", M1860: "6", M1820: "3", M1033: "4" }, // 18 + 18 + 11 + 12 = 59
  });
  expect(result.clinicalGroup).toBe("MMTA_CARDIAC");
  expect(result.primaryAcceptable).toBe(true);
  expect(result.functional.points).toBe(59);
  expect(result.functional.level).toBe("high");
  expect(result.comorbidity.level).toBe("none");
  // 1HC11: early / community / high functional / no comorbidity
  expect(result.caseMixWeight).toBe(1.1133);
  expect(result.weightApproximated).toBe(false);
  expect(result.estimatedPayment).toBe(Math.round(1.1133 * 2057.35));
});

test("COPD primary + low functional impairment → MMTA_RESPIRATORY, low", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "J44.9",
    secondaryIcd10s: [],
    answers: { M1800: "2", M1860: "2" }, // 3 + 6 = 9
  });
  expect(result.clinicalGroup).toBe("MMTA_RESPIRATORY");
  expect(result.functional.points).toBe(9);
  expect(result.functional.level).toBe("low");
});

test("the same 29 points is medium for MMTA_CARDIAC but low for NEURO_REHAB (per-group thresholds)", () => {
  const answers = { M1830: "5", M1820: "3" }; // 18 + 11 = 29
  const cardiac = computePdgm({ ...base, primaryIcd10: "I50.9", secondaryIcd10s: [], answers });
  expect(cardiac.functional.points).toBe(29);
  expect(cardiac.functional.level).toBe("medium"); // medium band starts at 28

  const neuro = computePdgm({ ...base, primaryIcd10: "G30.9", secondaryIcd10s: [], answers });
  expect(neuro.clinicalGroup).toBe("NEURO_REHAB");
  expect(neuro.functional.points).toBe(29);
  expect(neuro.functional.level).toBe("low"); // medium band starts at 34
});

test("functional level brackets the MMTA_CARDIAC medium cutoff (27 → low, 28 → medium)", () => {
  const low = computePdgm({
    ...base,
    primaryIcd10: "I50.9",
    secondaryIcd10s: [],
    answers: { M1830: "5", M1860: "2", M1800: "2" }, // 18 + 6 + 3 = 27
  });
  expect(low.functional.points).toBe(27);
  expect(low.functional.level).toBe("low");

  const medium = computePdgm({
    ...base,
    primaryIcd10: "I50.9",
    secondaryIcd10s: [],
    answers: { M1830: "5", M1860: "2", M1800: "2", M1850: "1" }, // 18 + 6 + 3 + 1 = 28
  });
  expect(medium.functional.points).toBe(28);
  expect(medium.functional.level).toBe("medium");
});

test("keeps the CY2025 M1860 quirk: response 3 scores below response 2", () => {
  const oneHandedDevice = computePdgm({
    ...base,
    primaryIcd10: "I50.9",
    secondaryIcd10s: [],
    answers: { M1860: "3" },
  });
  expect(oneHandedDevice.functional.points).toBe(2);
  const twoHandedDevice = computePdgm({
    ...base,
    primaryIcd10: "I50.9",
    secondaryIcd10s: [],
    answers: { M1860: "2" },
  });
  expect(twoHandedDevice.functional.points).toBe(6);
});

test("diabetes primary + CKD secondary → Renal 1 subgroup, but no low adjustment in CY2025", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "E11.29",
    secondaryIcd10s: ["N18.4"],
    answers: { M1800: "1" },
  });
  expect(result.clinicalGroup).toBe("MMTA_ENDOCRINE");
  expect(result.comorbidity.subgroups).toEqual(["Renal 1"]);
  expect(result.comorbidity.level).toBe("none");
});

test("diabetes primary + heart failure secondary → comorbidity low via Heart 11", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "E11.29",
    secondaryIcd10s: ["I50.9"],
    answers: {},
  });
  expect(result.comorbidity.level).toBe("low");
  expect(result.comorbidity.subgroups).toEqual(["Heart 11"]);
});

test("heart failure + paraplegia secondaries interact → comorbidity high", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "J44.9",
    secondaryIcd10s: ["I50.9", "G82.20"],
    answers: {},
  });
  expect(result.comorbidity.subgroups).toEqual(["Heart 11", "Neurological 7"]);
  expect(result.comorbidity.level).toBe("high");
});

test("two low subgroups that are not an interaction pair stay low, not high", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "I10",
    secondaryIcd10s: ["E11.29", "D64.9"], // Endocrine 3 + Circulatory 2: no CY2025 interaction
    answers: {},
  });
  expect(result.comorbidity.subgroups).toHaveLength(2);
  expect(result.comorbidity.level).toBe("low");
});

test("uncomplicated hypertension and hyperlipidemia secondaries credit no subgroup", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "J44.9",
    secondaryIcd10s: ["I10", "E78.5"],
    answers: {},
  });
  expect(result.comorbidity.subgroups).toEqual([]);
  expect(result.comorbidity.level).toBe("none");
});

test("hypertension primary is acceptable in CY2025 and groups to MMTA_CARDIAC", () => {
  const result = computePdgm({ ...base, primaryIcd10: "I10", secondaryIcd10s: [], answers: {} });
  expect(result.clinicalGroup).toBe("MMTA_CARDIAC");
  expect(result.primaryAcceptable).toBe(true);
});

test("return-to-provider primaries fall to MMTA_OTHER with primaryAcceptable false", () => {
  const unspecifiedKneeOsteoarthritis = computePdgm({
    ...base,
    primaryIcd10: "M17.9",
    secondaryIcd10s: [],
    answers: {},
  });
  expect(unspecifiedKneeOsteoarthritis.clinicalGroup).toBe("MMTA_OTHER");
  expect(unspecifiedKneeOsteoarthritis.clinicalGroupDriver).toBe("M17.9");
  expect(unspecifiedKneeOsteoarthritis.primaryAcceptable).toBe(false);

  const unspecifiedSideLungCancer = computePdgm({
    ...base,
    primaryIcd10: "C34.90",
    secondaryIcd10s: [],
    answers: {},
  });
  expect(unspecifiedSideLungCancer.clinicalGroup).toBe("MMTA_OTHER");
  expect(unspecifiedSideLungCancer.primaryAcceptable).toBe(false);
});

test("out-of-fixture primary degrades to MMTA_OTHER, not acceptable, but keeps the driver", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: "Z00.00",
    secondaryIcd10s: [],
    answers: {},
  });
  expect(result.clinicalGroup).toBe("MMTA_OTHER");
  expect(result.clinicalGroupDriver).toBe("Z00.00");
  expect(result.primaryAcceptable).toBe(false);
});

test("no primary → MMTA_OTHER, null driver, not acceptable", () => {
  const result = computePdgm({
    ...base,
    primaryIcd10: null,
    secondaryIcd10s: [],
    answers: {},
  });
  expect(result.clinicalGroup).toBe("MMTA_OTHER");
  expect(result.clinicalGroupDriver).toBeNull();
  expect(result.primaryAcceptable).toBe(false);
});

test("buildPdgmInput splits the primary from the secondaries and folds answers into a record", () => {
  const input = buildPdgmInput(
    [
      { coding: { icd10Code: "I50.9", isPrimary: false } },
      { coding: { icd10Code: "J44.9", isPrimary: true } },
      { coding: null }, // an uncoded diagnosis contributes nothing
      { coding: { icd10Code: "N18.4", isPrimary: false } },
    ],
    [
      { itemCode: "M1830", value: "3" },
      { itemCode: "M1700", value: "0" },
    ],
    "late",
    "institutional",
  );
  expect(input).toEqual({
    primaryIcd10: "J44.9",
    secondaryIcd10s: ["I50.9", "N18.4"],
    answers: { M1830: "3", M1700: "0" },
    timing: "late",
    admissionSource: "institutional",
  });
});

test("buildPdgmInput with no primary coded leaves primaryIcd10 null", () => {
  const input = buildPdgmInput(
    [{ coding: { icd10Code: "I50.9", isPrimary: false } }],
    [],
    "early",
    "community",
  );
  expect(input.primaryIcd10).toBeNull();
  expect(input.secondaryIcd10s).toEqual(["I50.9"]);
});

test("computePdgm over buildPdgmInput matches the hand-mapped input (server/device parity)", () => {
  const viaBuilder = computePdgm(
    buildPdgmInput(
      [
        { coding: { icd10Code: "E11.29", isPrimary: true } },
        { coding: { icd10Code: "I50.9", isPrimary: false } },
      ],
      [
        { itemCode: "M1830", value: "6" },
        { itemCode: "M1860", value: "6" },
      ],
      "early",
      "community",
    ),
  );
  const viaHandMapping = computePdgm({
    ...base,
    primaryIcd10: "E11.29",
    secondaryIcd10s: ["I50.9"],
    answers: { M1830: "6", M1860: "6" },
  });
  expect(viaBuilder).toEqual(viaHandMapping);
});

test("institutional admission uses its own published weight, above community", () => {
  const input: PdgmInput = {
    primaryIcd10: "I50.9",
    secondaryIcd10s: [],
    answers: { M1800: "1" },
    timing: "early",
    admissionSource: "community",
  };
  const community = computePdgm(input);
  const institutional = computePdgm({ ...input, admissionSource: "institutional" });
  expect(community.caseMixWeight).toBe(0.9102); // 1HA11
  expect(institutional.caseMixWeight).toBe(1.1175); // 2HA11
  expect(community.weightApproximated).toBe(false);
  expect(institutional.weightApproximated).toBe(false);
});

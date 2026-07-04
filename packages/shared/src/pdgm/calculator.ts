import {
  CLINICAL_GROUP_BASE_WEIGHT,
  CLINICAL_GROUP_LABELS,
  FUNCTIONAL_POINTS,
  FUNCTIONAL_THRESHOLDS,
  ICD10_CLINICAL_GROUP,
  ICD10_COMORBIDITY_SUBGROUP,
  ILLUSTRATIVE_BASE_RATE,
  type ClinicalGroup,
} from "./tables.ts";

export const TIMINGS = ["early", "late"] as const;
export const ADMISSION_SOURCES = ["community", "institutional"] as const;

export type FunctionalLevel = "low" | "medium" | "high";
export type ComorbidityLevel = "none" | "low" | "high";
export type Timing = (typeof TIMINGS)[number];
export type AdmissionSource = (typeof ADMISSION_SOURCES)[number];

// The eight OASIS items PDGM sums for the functional level: seven ADL items + the M1033 factor count.
const FUNCTIONAL_ITEMS = ["M1800", "M1810", "M1820", "M1830", "M1840", "M1850", "M1860", "M1033"];

export interface PdgmInput {
  primaryIcd10: string | null;
  secondaryIcd10s: string[];
  answers: Record<string, string>;
  timing: Timing;
  admissionSource: AdmissionSource;
}

export interface PdgmResult {
  clinicalGroup: ClinicalGroup;
  clinicalGroupLabel: string;
  clinicalGroupDriver: string | null;
  functional: {
    level: FunctionalLevel;
    points: number;
    breakdown: { itemCode: string; value: string; points: number }[];
  };
  comorbidity: { level: ComorbidityLevel; subgroups: string[] };
  timing: Timing;
  admissionSource: AdmissionSource;
  caseMixWeight: number;
  estimatedPayment: number;
}

function clinicalGroupFor(primaryIcd10: string | null): {
  group: ClinicalGroup;
  driver: string | null;
} {
  if (!primaryIcd10) return { group: "MMTA_OTHER", driver: null };
  return { group: ICD10_CLINICAL_GROUP[primaryIcd10] ?? "MMTA_OTHER", driver: primaryIcd10 };
}

function functionalFor(answers: Record<string, string>): PdgmResult["functional"] {
  const breakdown: PdgmResult["functional"]["breakdown"] = [];
  let points = 0;
  for (const itemCode of FUNCTIONAL_ITEMS) {
    const value = answers[itemCode];
    if (value === undefined) continue;
    const itemPoints = FUNCTIONAL_POINTS[itemCode]?.[value] ?? 0;
    points += itemPoints;
    breakdown.push({ itemCode, value, points: itemPoints });
  }
  const level: FunctionalLevel =
    points >= FUNCTIONAL_THRESHOLDS.high
      ? "high"
      : points >= FUNCTIONAL_THRESHOLDS.medium
        ? "medium"
        : "low";
  return { level, points, breakdown };
}

function comorbidityFor(secondaryIcd10s: string[]): PdgmResult["comorbidity"] {
  const subgroups = [
    ...new Set(
      secondaryIcd10s
        .map((code) => ICD10_COMORBIDITY_SUBGROUP[code])
        .filter((subgroup): subgroup is string => Boolean(subgroup)),
    ),
  ];
  // Low = at least one qualifying subgroup. High (interacting pairs) is out of scope.
  return { level: subgroups.length === 0 ? "none" : "low", subgroups };
}

const FUNCTIONAL_WEIGHT: Record<FunctionalLevel, number> = { low: 0.9, medium: 1.0, high: 1.15 };
const COMORBIDITY_WEIGHT: Record<ComorbidityLevel, number> = { none: 1.0, low: 1.05, high: 1.18 };

const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

// Runs the real PDGM classification (clinical group + functional level + comorbidity), then an
// illustrative case-mix weight and dollar estimate. See tables.ts for what's real vs illustrative.
export function computePdgm(input: PdgmInput): PdgmResult {
  const { group, driver } = clinicalGroupFor(input.primaryIcd10);
  const functional = functionalFor(input.answers);
  const comorbidity = comorbidityFor(input.secondaryIcd10s);

  const timingWeight = input.timing === "early" ? 1.0 : 0.97;
  const admissionWeight = input.admissionSource === "institutional" ? 1.05 : 1.0;
  const caseMixWeight = round(
    CLINICAL_GROUP_BASE_WEIGHT[group] *
      FUNCTIONAL_WEIGHT[functional.level] *
      COMORBIDITY_WEIGHT[comorbidity.level] *
      timingWeight *
      admissionWeight,
    3,
  );

  return {
    clinicalGroup: group,
    clinicalGroupLabel: CLINICAL_GROUP_LABELS[group],
    clinicalGroupDriver: driver,
    functional,
    comorbidity,
    timing: input.timing,
    admissionSource: input.admissionSource,
    caseMixWeight,
    estimatedPayment: Math.round(caseMixWeight * ILLUSTRATIVE_BASE_RATE),
  };
}

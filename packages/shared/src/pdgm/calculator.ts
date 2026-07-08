import { CASE_MIX_WEIGHTS } from "./case-mix-weights.ts";
import {
  CLINICAL_GROUP_BASE_WEIGHT,
  CLINICAL_GROUP_LABELS,
  FUNCTIONAL_POINTS,
  FUNCTIONAL_THRESHOLDS,
  HIGH_COMORBIDITY_INTERACTIONS,
  ICD10_CLINICAL_GROUP,
  ICD10_COMORBIDITY_SUBGROUP,
  LOW_COMORBIDITY_SUBGROUPS,
  NATIONAL_STANDARDIZED_30DAY_RATE,
  UNACCEPTABLE_PRIMARY_ICD10,
  type ClinicalGroup,
} from "./tables.ts";

export const TIMINGS = ["early", "late"] as const;
export const ADMISSION_SOURCES = ["community", "institutional"] as const;

export type FunctionalLevel = "low" | "medium" | "high";
export type ComorbidityLevel = "none" | "low" | "high";
export type Timing = (typeof TIMINGS)[number];
export type AdmissionSource = (typeof ADMISSION_SOURCES)[number];

// The eight OASIS items PDGM sums for the functional level: seven ADL items + the M1033 factor count.
export const FUNCTIONAL_ITEMS = [
  "M1800",
  "M1810",
  "M1820",
  "M1830",
  "M1840",
  "M1850",
  "M1860",
  "M1033",
];

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
  primaryAcceptable: boolean;
  functional: {
    level: FunctionalLevel;
    points: number;
    breakdown: { itemCode: string; value: string; points: number }[];
  };
  comorbidity: { level: ComorbidityLevel; subgroups: string[] };
  timing: Timing;
  admissionSource: AdmissionSource;
  caseMixWeight: number;
  weightApproximated: boolean;
  estimatedPayment: number;
}

function clinicalGroupFor(primaryIcd10: string | null): {
  group: ClinicalGroup;
  driver: string | null;
  acceptable: boolean;
} {
  if (!primaryIcd10) return { group: "MMTA_OTHER", driver: null, acceptable: false };
  const group = ICD10_CLINICAL_GROUP[primaryIcd10];
  // Unacceptable and unknown primaries keep MMTA_OTHER as a display fallback; acceptability is
  // carried by the flag so callers can tell them apart from a real MMTA_OTHER grouping.
  if (!group || UNACCEPTABLE_PRIMARY_ICD10.has(primaryIcd10)) {
    return { group: "MMTA_OTHER", driver: primaryIcd10, acceptable: false };
  }
  return { group, driver: primaryIcd10, acceptable: true };
}

function functionalFor(
  answers: Record<string, string>,
  group: ClinicalGroup,
): PdgmResult["functional"] {
  const breakdown: PdgmResult["functional"]["breakdown"] = [];
  let points = 0;
  for (const itemCode of FUNCTIONAL_ITEMS) {
    const value = answers[itemCode];
    if (value === undefined) continue;
    const itemPoints = FUNCTIONAL_POINTS[itemCode]?.[value] ?? 0;
    points += itemPoints;
    breakdown.push({ itemCode, value, points: itemPoints });
  }
  const thresholds = FUNCTIONAL_THRESHOLDS[group];
  const level: FunctionalLevel =
    points >= thresholds.high ? "high" : points >= thresholds.medium ? "medium" : "low";
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
  const present = new Set(subgroups);
  const interacts = HIGH_COMORBIDITY_INTERACTIONS.some(
    ([first, second]) => present.has(first) && present.has(second),
  );
  if (interacts) return { level: "high", subgroups };
  const creditsLow = subgroups.some((subgroup) => LOW_COMORBIDITY_SUBGROUPS.has(subgroup));
  return { level: creditsLow ? "low" : "none", subgroups };
}

const FUNCTIONAL_WEIGHT: Record<FunctionalLevel, number> = { low: 0.9, medium: 1.0, high: 1.15 };
const COMORBIDITY_WEIGHT: Record<ComorbidityLevel, number> = { none: 1.0, low: 1.05, high: 1.18 };

const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

// Multiplicative stand-in for a missing CASE_MIX_WEIGHTS cell — never hit while the full
// table ships, but keeps the estimate usable if the table is ever trimmed.
function approximateCaseMixWeight(
  group: ClinicalGroup,
  functionalLevel: FunctionalLevel,
  comorbidityLevel: ComorbidityLevel,
  timing: Timing,
  admissionSource: AdmissionSource,
): number {
  const timingWeight = timing === "early" ? 1.0 : 0.97;
  const admissionWeight = admissionSource === "institutional" ? 1.05 : 1.0;
  return round(
    CLINICAL_GROUP_BASE_WEIGHT[group] *
      FUNCTIONAL_WEIGHT[functionalLevel] *
      COMORBIDITY_WEIGHT[comorbidityLevel] *
      timingWeight *
      admissionWeight,
    3,
  );
}

export type ClinicalInputs = Omit<PdgmInput, "timing" | "admissionSource">;

// The one coded-diagnoses/answers mapping, shared by the server compute, the quality gate, and
// the on-device preview so all three classify identically. Structural parameter types avoid an
// import cycle with assessment.ts.
export function buildClinicalInputs(
  codedDiagnoses: { coding: { icd10Code: string; isPrimary: boolean } | null }[],
  answers: { itemCode: string; value: string }[],
): ClinicalInputs {
  const codings = codedDiagnoses.flatMap((diagnosis) =>
    diagnosis.coding ? [diagnosis.coding] : [],
  );
  const primaryIcd10 = codings.find((coding) => coding.isPrimary)?.icd10Code ?? null;
  const secondaryIcd10s = codings
    .filter((coding) => !coding.isPrimary)
    .map((coding) => coding.icd10Code);
  const answerValues = Object.fromEntries(answers.map((answer) => [answer.itemCode, answer.value]));
  return { primaryIcd10, secondaryIcd10s, answers: answerValues };
}

export function buildPdgmInput(
  codedDiagnoses: { coding: { icd10Code: string; isPrimary: boolean } | null }[],
  answers: { itemCode: string; value: string }[],
  timing: Timing,
  admissionSource: AdmissionSource,
): PdgmInput {
  return { ...buildClinicalInputs(codedDiagnoses, answers), timing, admissionSource };
}

// Runs the PDGM classification (clinical group + functional level + comorbidity) and looks up
// the published case-mix weight for the resulting HHRG. See tables.ts for sources, vintage, and
// what the dollar estimate excludes.
export function computePdgm(input: PdgmInput): PdgmResult {
  const { group, driver, acceptable } = clinicalGroupFor(input.primaryIcd10);
  const functional = functionalFor(input.answers, group);
  const comorbidity = comorbidityFor(input.secondaryIcd10s);

  const weightKey = `${group}|${input.timing}|${input.admissionSource}|${functional.level}|${comorbidity.level}`;
  const publishedWeight = CASE_MIX_WEIGHTS[weightKey];
  const caseMixWeight =
    publishedWeight ??
    approximateCaseMixWeight(
      group,
      functional.level,
      comorbidity.level,
      input.timing,
      input.admissionSource,
    );

  return {
    clinicalGroup: group,
    clinicalGroupLabel: CLINICAL_GROUP_LABELS[group],
    clinicalGroupDriver: driver,
    primaryAcceptable: acceptable,
    functional,
    comorbidity,
    timing: input.timing,
    admissionSource: input.admissionSource,
    caseMixWeight,
    weightApproximated: publishedWeight === undefined,
    estimatedPayment: Math.round(caseMixWeight * NATIONAL_STANDARDIZED_30DAY_RATE),
  };
}

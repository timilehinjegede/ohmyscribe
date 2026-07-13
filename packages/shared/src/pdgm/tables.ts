// CY2025 PDGM (Patient-Driven Groupings Model) reference tables, transcribed from CMS sources:
//   - Diagnosis crosswalk (clinical group, comorbidity subgroup, acceptable-primary), functional
//     points, and per-group thresholds: HH PPS Grouper Software v06.0.25 reference tables
//     (cms.gov "Home Health Grouper Software", Jan 2025 release).
//   - Comorbidity low subgroups + high interactions: "CY 2025 Final Low Comorbidity and High
//     Comorbidity Adjustment Interactions" (cms.gov, CMS-1803-F addenda).
//   - Case-mix weights: "CY 2025 Final Home Health Case-Mix Weights" (see case-mix-weights.ts).
//   - Base rate: CY2025 national standardized 30-day period rate (CMS-1803-F).
//
// REAL and source-verified: everything above. Deliberately scoped: the two ICD-10 maps cover only
// the codes our referral crosswalk can produce (plus G82.20); any other code falls back to
// MMTA_OTHER and is treated as not acceptable as a principal diagnosis.
// OUT OF SCOPE (estimate only): wage index, LUPA, PEP, outliers, VBP, sequestration, and the
// grouper's claim-level sequencing rules (code-first, manifestation, external-cause).

export type ClinicalGroup =
  | "MMTA_CARDIAC"
  | "MMTA_RESPIRATORY"
  | "MMTA_ENDOCRINE"
  | "MMTA_GI_GU"
  | "MMTA_INFECTIOUS"
  | "MMTA_SURGICAL"
  | "MMTA_OTHER"
  | "NEURO_REHAB"
  | "WOUND"
  | "COMPLEX_NURSING"
  | "MS_REHAB"
  | "BEHAVIORAL_HEALTH";

export const CLINICAL_GROUP_LABELS: Record<ClinicalGroup, string> = {
  MMTA_CARDIAC: "MMTA - Cardiac & Circulatory",
  MMTA_RESPIRATORY: "MMTA - Respiratory",
  MMTA_ENDOCRINE: "MMTA - Endocrine",
  MMTA_GI_GU: "MMTA - GI / GU",
  MMTA_INFECTIOUS: "MMTA - Infectious / Neoplasm / Blood",
  MMTA_SURGICAL: "MMTA - Surgical Aftercare",
  MMTA_OTHER: "MMTA - Other",
  NEURO_REHAB: "Neuro / Stroke Rehabilitation",
  WOUND: "Wound",
  COMPLEX_NURSING: "Complex Nursing Interventions",
  MS_REHAB: "Musculoskeletal Rehabilitation",
  BEHAVIORAL_HEALTH: "Behavioral Health",
};

// Principal ICD-10 → clinical group. Notable corrections vs intuition: I10 and E78.5 DO group
// (hypertension → cardiac, hyperlipidemia → other) even though older "unacceptable diagnosis"
// lists reject them; epilepsy and migraine are MMTA_OTHER, not neuro; anemia is MMTA_INFECTIOUS
// (blood-forming).
export const ICD10_CLINICAL_GROUP: Record<string, ClinicalGroup> = {
  I10: "MMTA_CARDIAC",
  "I50.9": "MMTA_CARDIAC",
  "I25.9": "MMTA_CARDIAC",
  "J44.9": "MMTA_RESPIRATORY",
  "J45.909": "MMTA_RESPIRATORY",
  "J18.9": "MMTA_RESPIRATORY",
  "E11.29": "MMTA_ENDOCRINE",
  "N18.1": "MMTA_GI_GU",
  "N18.2": "MMTA_GI_GU",
  "N18.30": "MMTA_GI_GU",
  "N18.4": "MMTA_GI_GU",
  "N39.0": "MMTA_GI_GU",
  "K63.5": "MMTA_GI_GU",
  "A41.9": "MMTA_INFECTIOUS",
  "D64.9": "MMTA_INFECTIOUS",
  "G30.9": "NEURO_REHAB",
  "G82.20": "NEURO_REHAB",
  "F19.20": "BEHAVIORAL_HEALTH",
  "E78.5": "MMTA_OTHER",
  "J32.9": "MMTA_OTHER",
  "Q61.4": "MMTA_OTHER",
  "M81.0": "MMTA_OTHER",
  "G40.909": "MMTA_OTHER",
  "G43.719": "MMTA_OTHER",
};

// Principal diagnoses the grouper returns to the provider (no clinical group): symptom, dental,
// and site/laterality-unspecified codes — including, non-obviously, unspecified knee/hand OA,
// unspecified-side lung cancer, and ESRD (N18.6). E88.81 stopped being billable in FY2023
// (subdivided into E88.810/.811), so it can no longer be a valid principal either.
export const UNACCEPTABLE_PRIMARY_ICD10 = new Set<string>([
  "R56.9",
  "R65.21",
  "T14.90XA",
  "K08.109",
  "K01.1",
  "M17.9",
  "M19.049",
  "M41.129",
  "C34.90",
  "N18.6",
  "E88.81",
]);

// OASIS functional item → response value → points. Real quirk to keep: M1860 response "3" (walks
// with a one-handed device) scores 2, BELOW response "2" (6) — CMS's regression, not a typo.
export const FUNCTIONAL_POINTS: Record<string, Record<string, number>> = {
  M1800: { "0": 0, "1": 0, "2": 3, "3": 3 },
  M1810: { "0": 0, "1": 0, "2": 5, "3": 5 },
  M1820: { "0": 0, "1": 0, "2": 3, "3": 11 },
  M1830: { "0": 0, "1": 0, "2": 3, "3": 10, "4": 10, "5": 18, "6": 18 },
  M1840: { "0": 0, "1": 0, "2": 5, "3": 5, "4": 5 },
  M1850: { "0": 0, "1": 1, "2": 4, "3": 4, "4": 4, "5": 4 },
  M1860: { "0": 0, "1": 0, "2": 6, "3": 2, "4": 18, "5": 18, "6": 18 },
  M1033: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 12 },
};

// Inclusive cutoffs: high at points >= high, medium at points >= medium, else low.
export const FUNCTIONAL_THRESHOLDS: Record<ClinicalGroup, { medium: number; high: number }> = {
  MS_REHAB: { medium: 30, high: 44 },
  NEURO_REHAB: { medium: 34, high: 50 },
  WOUND: { medium: 33, high: 49 },
  COMPLEX_NURSING: { medium: 30, high: 53 },
  BEHAVIORAL_HEALTH: { medium: 29, high: 45 },
  MMTA_SURGICAL: { medium: 28, high: 41 },
  MMTA_CARDIAC: { medium: 28, high: 41 },
  MMTA_ENDOCRINE: { medium: 28, high: 41 },
  MMTA_GI_GU: { medium: 33, high: 48 },
  MMTA_INFECTIOUS: { medium: 32, high: 45 },
  MMTA_RESPIRATORY: { medium: 33, high: 45 },
  MMTA_OTHER: { medium: 29, high: 44 },
};

// Secondary ICD-10 → comorbidity subgroup. I10 and E78.5 map to NO subgroup (they never
// credit an adjustment). G82.20 (paraplegia → Neurological 7) sits outside the referral crosswalk;
// it is included so a high-comorbidity interaction is reachable with these fixtures.
export const ICD10_COMORBIDITY_SUBGROUP: Record<string, string> = {
  "I50.9": "Heart 11",
  "I25.9": "Heart 7",
  "E11.29": "Endocrine 3",
  "J44.9": "Respiratory 5",
  "J45.909": "Respiratory 5",
  "J18.9": "Respiratory 2",
  "D64.9": "Circulatory 2",
  "N18.1": "Renal 1",
  "N18.2": "Renal 1",
  "N18.30": "Renal 1",
  "N18.4": "Renal 1",
  "N18.6": "Renal 1",
  "N39.0": "Renal 3",
  "A41.9": "Infectious 1",
  "C34.90": "Neoplasms 6",
  "M81.0": "Musculoskeletal 3",
  "G30.9": "Neurological 4",
  "G40.909": "Neurological 8",
  "F19.20": "Behavioral 7",
  "G82.20": "Neurological 7",
};

// The 22 subgroups that alone credit the LOW comorbidity adjustment. A subgroup outside
// this set (e.g. Renal 1 — CKD/ESRD) still exists for HIGH interactions but earns nothing alone.
export const LOW_COMORBIDITY_SUBGROUPS = new Set<string>([
  "Cerebral 4",
  "Circulatory 2",
  "Circulatory 7",
  "Circulatory 9",
  "Circulatory 10",
  "Endocrine 3",
  "Endocrine 4",
  "Gastrointestinal 2",
  "Heart 10",
  "Heart 11",
  "Neoplasms 1",
  "Neoplasms 2",
  "Neoplasms 17",
  "Neoplasms 18",
  "Neurological 5",
  "Neurological 7",
  "Neurological 10",
  "Neurological 11",
  "Neurological 12",
  "Skin 1",
  "Skin 3",
  "Skin 4",
]);

// All 94 subgroup pairs that trigger the HIGH comorbidity adjustment (unordered).
export const HIGH_COMORBIDITY_INTERACTIONS: readonly (readonly [string, string])[] = [
  ["Behavioral 2", "Circulatory 10"],
  ["Behavioral 2", "Neurological 7"],
  ["Behavioral 2", "Skin 3"],
  ["Behavioral 2", "Skin 4"],
  ["Behavioral 4", "Skin 3"],
  ["Behavioral 4", "Skin 4"],
  ["Behavioral 5", "Neurological 5"],
  ["Behavioral 5", "Neurological 7"],
  ["Behavioral 5", "Skin 1"],
  ["Behavioral 5", "Skin 3"],
  ["Cerebral 4", "Circulatory 7"],
  ["Cerebral 4", "Circulatory 9"],
  ["Cerebral 4", "Endocrine 3"],
  ["Cerebral 4", "Heart 10"],
  ["Cerebral 4", "Neurological 10"],
  ["Cerebral 4", "Neurological 12"],
  ["Cerebral 4", "Respiratory 2"],
  ["Cerebral 4", "Skin 3"],
  ["Circulatory 1", "Neurological 7"],
  ["Circulatory 1", "Skin 1"],
  ["Circulatory 1", "Skin 3"],
  ["Circulatory 2", "Gastrointestinal 2"],
  ["Circulatory 2", "Neurological 7"],
  ["Circulatory 4", "Circulatory 9"],
  ["Circulatory 4", "Neurological 7"],
  ["Circulatory 4", "Skin 3"],
  ["Circulatory 7", "Neurological 5"],
  ["Circulatory 7", "Skin 3"],
  ["Circulatory 9", "Endocrine 4"],
  ["Circulatory 9", "Renal 3"],
  ["Circulatory 10", "Circulatory 4"],
  ["Circulatory 10", "Endocrine 1"],
  ["Circulatory 10", "Endocrine 5"],
  ["Circulatory 10", "Heart 11"],
  ["Circulatory 10", "Musculoskeletal 3"],
  ["Circulatory 10", "Renal 3"],
  ["Circulatory 10", "Skin 1"],
  ["Circulatory 10", "Skin 3"],
  ["Endocrine 1", "Neoplasms 2"],
  ["Endocrine 1", "Neurological 7"],
  ["Endocrine 1", "Skin 3"],
  ["Endocrine 3", "Endocrine 4"],
  ["Endocrine 3", "Neurological 7"],
  ["Endocrine 3", "Skin 3"],
  ["Endocrine 4", "Neurological 5"],
  ["Endocrine 4", "Neurological 7"],
  ["Endocrine 4", "Skin 1"],
  ["Endocrine 4", "Skin 3"],
  ["Endocrine 4", "Skin 4"],
  ["Endocrine 5", "Neurological 5"],
  ["Endocrine 5", "Neurological 7"],
  ["Endocrine 5", "Skin 3"],
  ["Gastrointestinal 4", "Skin 3"],
  ["Heart 5", "Neurological 10"],
  ["Heart 8", "Skin 3"],
  ["Heart 9", "Skin 3"],
  ["Heart 10", "Neurological 7"],
  ["Heart 10", "Skin 3"],
  ["Heart 10", "Skin 4"],
  ["Heart 11", "Neurological 5"],
  ["Heart 11", "Neurological 7"],
  ["Heart 11", "Skin 3"],
  ["Heart 11", "Skin 4"],
  ["Heart 12", "Neurological 7"],
  ["Heart 12", "Skin 3"],
  ["Infectious 1", "Neurological 7"],
  ["Infectious 1", "Skin 3"],
  ["Infectious 1", "Skin 4"],
  ["Musculoskeletal 3", "Neurological 5"],
  ["Musculoskeletal 3", "Skin 3"],
  ["Musculoskeletal 3", "Skin 4"],
  ["Musculoskeletal 4", "Skin 3"],
  ["Neurological 4", "Skin 4"],
  ["Neurological 5", "Neurological 7"],
  ["Neurological 7", "Neurological 8"],
  ["Neurological 7", "Renal 3"],
  ["Neurological 7", "Respiratory 5"],
  ["Neurological 7", "Skin 4"],
  ["Neurological 10", "Neurological 7"],
  ["Neurological 10", "Skin 1"],
  ["Neurological 10", "Skin 3"],
  ["Neurological 10", "Skin 4"],
  ["Neurological 12", "Neurological 7"],
  ["Neurological 12", "Skin 3"],
  ["Renal 1", "Skin 1"],
  ["Renal 1", "Skin 3"],
  ["Renal 1", "Skin 4"],
  ["Renal 3", "Skin 1"],
  ["Renal 3", "Skin 3"],
  ["Renal 3", "Skin 4"],
  ["Respiratory 5", "Skin 4"],
  ["Respiratory 9", "Skin 4"],
  ["Skin 1", "Skin 3"],
  ["Skin 3", "Skin 4"],
];

// Illustrative per-group base weight, used only by approximateCaseMixWeight's fallback.
export const CLINICAL_GROUP_BASE_WEIGHT: Record<ClinicalGroup, number> = {
  MMTA_CARDIAC: 1.05,
  MMTA_RESPIRATORY: 1.02,
  MMTA_ENDOCRINE: 1.0,
  MMTA_GI_GU: 0.98,
  MMTA_INFECTIOUS: 1.1,
  MMTA_SURGICAL: 1.15,
  MMTA_OTHER: 0.9,
  NEURO_REHAB: 1.2,
  WOUND: 1.25,
  COMPLEX_NURSING: 1.3,
  MS_REHAB: 1.1,
  BEHAVIORAL_HEALTH: 0.95,
};

// The rate for agencies submitting quality data; non-submitters get a 2% lower rate we don't model.
export const NATIONAL_STANDARDIZED_30DAY_RATE = 2057.35;

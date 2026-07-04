// TODO: Make and map this up. Illustrative PDGM (Patient-Driven Groupings Model) reference tables.
//
// The algorithm in calculator.ts is the real PDGM structure. These tables are deliberately scoped:
//   - Clinical-group map: keyed to the ICD-10s in our referral fixtures, assigned by ICD chapter and
//     NOT cross-checked against the full CMS clinical-group crosswalk; unmapped codes fall to
//     MMTA_OTHER (a real PDGM default).
//   - Functional points / thresholds: illustrative values with the real shape (per-response points,
//     summed, bucketed); production transcribes them from the CMS CY2026 HH PPS Final Rule.
//   - Comorbidity: a small fixture-scoped subgroup list (None/Low only); the High interaction grid
//     is out of scope.
//   - Case-mix weight / base rate: illustrative representative numbers, not the CMS weight table.

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
  MMTA_CARDIAC: "MMTA – Cardiac & Circulatory",
  MMTA_RESPIRATORY: "MMTA – Respiratory",
  MMTA_ENDOCRINE: "MMTA – Endocrine",
  MMTA_GI_GU: "MMTA – GI / GU",
  MMTA_INFECTIOUS: "MMTA – Infectious / Neoplasm / Blood",
  MMTA_SURGICAL: "MMTA – Surgical Aftercare",
  MMTA_OTHER: "MMTA – Other",
  NEURO_REHAB: "Neuro / Stroke Rehabilitation",
  WOUND: "Wound",
  COMPLEX_NURSING: "Complex Nursing Interventions",
  MS_REHAB: "Musculoskeletal Rehabilitation",
  BEHAVIORAL_HEALTH: "Behavioral Health",
};

// Primary ICD-10 → clinical group, scoped to our fixture diagnoses (chapter-assigned; verify against
// the CMS clinical-group crosswalk). Symptom / questionable-primary codes are left to MMTA_OTHER.
export const ICD10_CLINICAL_GROUP: Record<string, ClinicalGroup> = {
  I10: "MMTA_CARDIAC",
  "I50.9": "MMTA_CARDIAC",
  "I25.9": "MMTA_CARDIAC",
  "E78.5": "MMTA_CARDIAC", // hyperlipidemia rarely stands as a valid HH primary
  "J44.9": "MMTA_RESPIRATORY",
  "J45.909": "MMTA_RESPIRATORY",
  "J18.9": "MMTA_RESPIRATORY",
  "J32.9": "MMTA_RESPIRATORY",
  "E11.29": "MMTA_ENDOCRINE",
  "E88.81": "MMTA_ENDOCRINE",
  "N39.0": "MMTA_GI_GU",
  "N18.1": "MMTA_GI_GU",
  "N18.2": "MMTA_GI_GU",
  "N18.30": "MMTA_GI_GU",
  "N18.4": "MMTA_GI_GU",
  "N18.6": "MMTA_GI_GU",
  "Q61.4": "MMTA_GI_GU",
  "K63.5": "MMTA_GI_GU", // colon polyp: usually a questionable HH primary
  "C34.90": "MMTA_INFECTIOUS", // neoplasm
  "D64.9": "MMTA_INFECTIOUS", // blood-forming
  "A41.9": "MMTA_INFECTIOUS", // sepsis: real coding sequences the underlying infection first
  "M17.9": "MS_REHAB",
  "M19.049": "MS_REHAB",
  "M41.129": "MS_REHAB",
  "M81.0": "MS_REHAB", // osteoporosis is sometimes grouped under MMTA
  "G30.9": "NEURO_REHAB", // Alzheimer's is frequently a questionable HH primary
  "G40.909": "NEURO_REHAB",
  "F19.20": "BEHAVIORAL_HEALTH",
  "T14.90XA": "WOUND", // unspecified-injury placeholder; real coding needs a site-specific S-code
  // Left to MMTA_OTHER on purpose: G43.719 (migraine), R56.9 / R65.21 (symptoms), K08.109 / K01.1 (dental).
};

// OASIS functional item → response value → points. Illustrative values, real shape (impairment ↑ →
// points ↑; M1033 scored by factor count). Production sources these from the CMS Final Rule.
export const FUNCTIONAL_POINTS: Record<string, Record<string, number>> = {
  M1800: { "0": 0, "1": 2, "2": 4, "3": 6 },
  M1810: { "0": 0, "1": 1, "2": 3, "3": 5 },
  M1820: { "0": 0, "1": 2, "2": 4, "3": 6 },
  M1830: { "0": 0, "1": 2, "2": 4, "3": 6, "4": 4, "5": 6, "6": 8 },
  M1840: { "0": 0, "1": 2, "2": 3, "3": 3, "4": 6 },
  M1850: { "0": 0, "1": 2, "2": 4, "3": 6, "4": 5, "5": 7 },
  M1860: { "0": 0, "1": 2, "2": 4, "3": 6, "4": 6, "5": 8, "6": 9 },
  M1033: { "0": 0, "1": 2, "2": 4, "3": 6, "4": 8 },
};

// Illustrative Low / Medium / High cutoffs on the summed points (production: per clinical group).
export const FUNCTIONAL_THRESHOLDS = { medium: 12, high: 26 } as const;

// Secondary ICD-10 → comorbidity subgroup, scoped to our fixtures (illustrative subgroup names).
// Any qualifying secondary yields a Low adjustment; the High interaction grid is out of scope.
export const ICD10_COMORBIDITY_SUBGROUP: Record<string, string> = {
  "E11.29": "Endocrine",
  "N18.1": "Renal",
  "N18.2": "Renal",
  "N18.30": "Renal",
  "N18.4": "Renal",
  "N18.6": "Renal",
  "I50.9": "Circulatory",
  I10: "Circulatory",
  "I25.9": "Circulatory",
  "E78.5": "Circulatory",
  "J44.9": "Respiratory",
  "J45.909": "Respiratory",
  "D64.9": "Blood",
};

// Illustrative per-group base case-mix weight (representative; not the CMS weight table).
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

// Illustrative national 30-day base payment ($), representative — not the CMS CY2026 rate.
export const ILLUSTRATIVE_BASE_RATE = 2000;

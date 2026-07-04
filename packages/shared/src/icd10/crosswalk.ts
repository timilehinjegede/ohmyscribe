// SNOMED CT → ICD-10-CM crosswalk for the disorders in our curated referral fixtures.
// Doubles as the suggestion source (the code to propose for a referral diagnosis) and the
// validation allowlist. Codes verified against the NLM ICD-10-CM API and icd10data (the
// official SNOMED→ICD-10-CM map is UMLS-license-gated); low/medium-confidence rows carry an
// inline caveat and need a coder's confirmation.

export type Icd10Confidence = "high" | "medium" | "low";

export interface Icd10Mapping {
  /** ICD-10-CM code to suggest. */
  icd10: string;
  /** Official ICD-10-CM description. */
  display: string;
  confidence: Icd10Confidence;
}

// Keyed by SNOMED CT concept id. Inline comments flag the rows a coder should confirm.
export const snomedToIcd10: Record<string, Icd10Mapping> = {
  "6525002": { icd10: "F19.20", display: "Other psychoactive substance dependence, uncomplicated", confidence: "medium" }, // dependence, not abuse (F19.10); use the substance-specific F11–F18 code if documented
  "26929004": { icd10: "G30.9", display: "Alzheimer's disease, unspecified", confidence: "high" },
  "37320007": { icd10: "K08.109", display: "Complete loss of teeth, unspecified cause, unspecified class", confidence: "low" }, // complete loss; K08.409 if partial
  "40055000": { icd10: "J32.9", display: "Chronic sinusitis, unspecified", confidence: "high" },
  "59621000": { icd10: "I10", display: "Essential (primary) hypertension", confidence: "high" },
  "64859006": { icd10: "M81.0", display: "Age-related osteoporosis without current pathological fracture", confidence: "high" }, // M80.- if a current pathological fracture is documented
  "68496003": { icd10: "K63.5", display: "Polyp of colon", confidence: "high" },
  "76571007": { icd10: "R65.21", display: "Severe sepsis with septic shock", confidence: "high" }, // sequence the underlying infection (e.g. A41.9) first
  "84757009": { icd10: "G40.909", display: "Epilepsy, unspecified, not intractable, without status epilepticus", confidence: "high" },
  "88805009": { icd10: "I50.9", display: "Heart failure, unspecified", confidence: "high" }, // I50.x, not I25.x
  "91302008": { icd10: "A41.9", display: "Sepsis, unspecified organism", confidence: "high" },
  "127013003": { icd10: "E11.29", display: "Type 2 diabetes mellitus with other diabetic kidney complication", confidence: "medium" }, // SNOMED leaves DM type unspecified; ICD-10-CM defaults unspecified-type to type 2
  "128613002": { icd10: "R56.9", display: "Unspecified convulsions", confidence: "low" }, // R56.9 (icd10data) vs G40.909 (ICD Index treats "seizure disorder" as epilepsy)
  "195967001": { icd10: "J45.909", display: "Unspecified asthma, uncomplicated", confidence: "high" },
  "196416002": { icd10: "K01.1", display: "Impacted teeth", confidence: "high" }, // no molar-specific code; tooth type is not captured
  "197927001": { icd10: "N39.0", display: "Urinary tract infection, site not specified", confidence: "high" }, // "recurrent" is not separately coded
  "201834006": { icd10: "M19.049", display: "Primary osteoarthritis, unspecified hand", confidence: "high" }, // laterality unspecified
  "203646004": { icd10: "M41.129", display: "Adolescent idiopathic scoliosis, site unspecified", confidence: "high" },
  "237602007": { icd10: "E88.81", display: "Metabolic syndrome", confidence: "high" },
  "239873007": { icd10: "M17.9", display: "Osteoarthritis of knee, unspecified", confidence: "high" }, // laterality unspecified
  "254637007": { icd10: "C34.90", display: "Malignant neoplasm of unspecified part of unspecified bronchus or lung", confidence: "high" }, // laterality unspecified
  "271737000": { icd10: "D64.9", display: "Anemia, unspecified", confidence: "high" },
  "414545008": { icd10: "I25.9", display: "Chronic ischemic heart disease, unspecified", confidence: "medium" }, // broad parent; I25.10 if atherosclerotic
  "424132000": { icd10: "C34.90", display: "Malignant neoplasm of unspecified part of unspecified bronchus or lung", confidence: "high" }, // ICD-10-CM does not encode TNM stage
  "431855005": { icd10: "N18.1", display: "Chronic kidney disease, stage 1", confidence: "high" },
  "431856006": { icd10: "N18.2", display: "Chronic kidney disease, stage 2 (mild)", confidence: "high" },
  "433144002": { icd10: "N18.30", display: "Chronic kidney disease, stage 3 unspecified", confidence: "high" }, // N18.30 is billable; N18.3 became a non-billable parent (subdivided 2020)
  "431857002": { icd10: "N18.4", display: "Chronic kidney disease, stage 4 (severe)", confidence: "high" },
  "90781000119102": { icd10: "E11.29", display: "Type 2 diabetes mellitus with other diabetic kidney complication", confidence: "high" }, // microalbuminuria = E11.29, not E11.21 (frank nephropathy)
  "124171000119105": { icd10: "G43.719", display: "Chronic migraine without aura, intractable, without status migrainosus", confidence: "high" },
  "157141000119108": { icd10: "E11.29", display: "Type 2 diabetes mellitus with other diabetic kidney complication", confidence: "high" }, // diabetic proteinuria = E11.29, not E11.21
  "46177005": { icd10: "N18.6", display: "End stage renal disease", confidence: "high" }, // add Z99.2 if dialysis-dependent
  "55822004": { icd10: "E78.5", display: "Hyperlipidemia, unspecified", confidence: "high" },
  "185086009": { icd10: "J44.9", display: "Chronic obstructive pulmonary disease, unspecified", confidence: "high" }, // J44.0/J44.1 if with infection/exacerbation
  "204949001": { icd10: "Q61.4", display: "Renal dysplasia", confidence: "high" },
  "233604007": { icd10: "J18.9", display: "Pneumonia, unspecified organism", confidence: "high" },
  "262574004": { icd10: "T14.90XA", display: "Injury, unspecified, initial encounter", confidence: "low" }, // placeholder — real coding needs a site-specific S-code + external cause W34.00XA
  "283545005": { icd10: "T14.90XA", display: "Injury, unspecified, initial encounter", confidence: "low" }, // placeholder — real coding needs a site-specific S-code + external cause W34.00XA
};

// The suggested mapping for a referral diagnosis, or null when the SNOMED concept is
// outside the curated set.
export const icd10ForSnomed = (snomedCode: string): Icd10Mapping | null =>
  snomedToIcd10[snomedCode] ?? null;

# Synthea referral fixtures

Curated synthetic referral bundles that seed the ingestion pipeline. Each is a real
[Synthea](https://github.com/synthetichealth/synthea) patient from the public
`synthea_sample_data_fhir_latest` sample set (115 patients), **stripped to `Patient` +
`Condition` resources** — the only parts the referral ingestion reads. 100% synthetic, no PHI.

## Selection

From the 115 patients we kept those with **≥ 3 active `(disorder)` conditions, each carrying
an `onsetDateTime`**, then took the top 15 by disorder count (capped at 8 to avoid unwieldy
lists). Active-disorder count matters because ingestion drops resolved conditions and social
"findings" (~20% of random patients have none); `onsetDateTime` matters because onset is the
grounding signal for AI primary-diagnosis suggestions.

## Clinical profiles

| Fixture | Patient | Sex | Born | # | Active disorders |
|---|---|:--:|:--:|:--:|---|
| `referral-01` | Kautzer186 | F | 1973 | 8 | Seizure disorder, Epilepsy, Essential hypertension, Chronic kidney disease stage 1, Disorder of kidney due to diabetes mellitus, Chronic kidney disease stage 2, Microalbuminuria due to type 2 diabetes mellitus, Metabolic syndrome X |
| `referral-02` | Herman763 | M | 1956 | 8 | Sepsis, Septic shock, Chronic intractable migraine without aura, Impacted molars, Dependent drug abuse, Essential hypertension, Ischemic heart disease, Osteoarthritis of knee |
| `referral-03` | Gulgowski816 | M | 1981 | 8 | Essential hypertension, Anemia, Chronic kidney disease stage 2, Disorder of kidney due to diabetes mellitus, Microalbuminuria due to type 2 diabetes mellitus, Metabolic syndrome X, Chronic kidney disease stage 3, Proteinuria due to type 2 diabetes mellitus |
| `referral-04` | King743 | M | 1986 | 8 | Essential hypertension, Chronic kidney disease stage 1, Disorder of kidney due to diabetes mellitus, Chronic kidney disease stage 3, Microalbuminuria due to type 2 diabetes mellitus, Proteinuria due to type 2 diabetes mellitus, Anemia, Chronic kidney disease stage 4 |
| `referral-05` | Dickens475 | F | 1997 | 8 | Loss of teeth, Asthma, Essential hypertension, Chronic kidney disease stage 1, Disorder of kidney due to diabetes mellitus, Chronic kidney disease stage 2, Microalbuminuria due to type 2 diabetes mellitus, Recurrent urinary tract infection |
| `referral-06` | Haag279 | M | 1957 | 7 | Anemia, Essential hypertension, Disorder of kidney due to diabetes mellitus, Ischemic heart disease, Metabolic syndrome X, Microalbuminuria due to type 2 diabetes mellitus, Proteinuria due to type 2 diabetes mellitus |
| `referral-07` | Barton704 | M | 1969 | 6 | Chronic sinusitis, Sepsis, Non-small cell lung cancer, Anemia, Non-small cell carcinoma of lung, TNM stage 1, Polyp of colon |
| `referral-08` | Pagac496 | M | 1969 | 6 | Adolescent idiopathic scoliosis, Chronic intractable migraine without aura, Impacted molars, Anemia, Dependent drug abuse, Chronic sinusitis |
| `referral-09` | Altenwerth646 | F | 1925 | 6 | Recurrent urinary tract infection, Anemia, Osteoporosis, Alzheimer's disease, Ischemic heart disease, Chronic congestive heart failure |
| `referral-10` | Vandervort697 | F | 1966 | 6 | Chronic sinusitis, Anemia, Chronic intractable migraine without aura, Essential hypertension, Ischemic heart disease, Localized, primary osteoarthritis of the hand |
| `referral-11` | Cole117 | F | 1925 | 6 | Recurrent urinary tract infection, Anemia, Hyperlipidemia, Ischemic heart disease, Alzheimer's disease, Pneumonia |
| `referral-12` | Huels583 | M | 1968 | 5 | Impacted molars, Chronic intractable migraine without aura, Dependent drug abuse, Gunshot wound, Bullet wound |
| `referral-13` | Krajcik437 | F | 1932 | 4 | Chronic sinusitis, Anemia, Gunshot wound, Bullet wound |
| `referral-14` | Feil794 | M | 1968 | 4 | Renal dysplasia, End-stage renal disease, Seizure disorder, Epilepsy |
| `referral-15` | Armstrong51 | F | 1961 | 4 | Chronic obstructive bronchitis, Anemia, Polyp of colon, Recurrent urinary tract infection |

## Provenance

| Fixture | Source Synthea bundle |
|---|---|
| `referral-01.json` | `Lewis216_Kautzer186_1f0dab59-2cb5-5b52-9687-536444ee049b.json` |
| `referral-02.json` | `Lyle846_Herman763_072cf2a0-0186-ca37-39fd-f82ff5daf4ee.json` |
| `referral-03.json` | `Nathaniel596_Gulgowski816_ecb87cf3-081e-83f3-b5d9-0995b43c6b68.json` |
| `referral-04.json` | `Oswaldo857_King743_50c84989-4624-982f-3e0b-ae9ace8dbd48.json` |
| `referral-05.json` | `Jone716_Suzann567_Dickens475_396f5810-7c15-9dc4-13f0-07e55afa7514.json` |
| `referral-06.json` | `Antione404_Haag279_89eded81-4a51-f304-ee16-58c137114a71.json` |
| `referral-07.json` | `Raleigh478_Barton704_eb688301-18a0-59a1-33b1-b764c0e66f09.json` |
| `referral-08.json` | `Jamel269_Pagac496_14bebf4d-799e-6024-ea6c-254d1dadfbe1.json` |
| `referral-09.json` | `Marquita692_Naoma512_Altenwerth646_8d2c71f3-02ed-b2cd-5aa2-dbd6d41e3de6.json` |
| `referral-10.json` | `Chiquita638_Vandervort697_269c9001-961e-5c04-c250-442ec7c276c5.json` |
| `referral-11.json` | `Francene766_Lennie123_Cole117_a9b60932-d725-dea6-fd7d-7596e770bbf3.json` |
| `referral-12.json` | `Rich940_Huels583_b07fc407-3857-309a-d77c-dc1b62776087.json` |
| `referral-13.json` | `Hertha832_Li461_Krajcik437_e3694fe7-1864-9c62-7fca-527181386876.json` |
| `referral-14.json` | `Alphonso102_Feil794_cfffd931-a052-128d-d0dd-7cbda6ad8465.json` |
| `referral-15.json` | `Lorena247_Trinity427_Armstrong51_adb4d375-7ca2-e320-7808-1b4b2363fff8.json` |

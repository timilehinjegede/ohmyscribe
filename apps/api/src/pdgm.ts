import type { Db } from "@ohmyscribe/db";
import {
  computePdgm,
  type AdmissionSource,
  type PdgmResult,
  type Timing,
} from "@ohmyscribe/shared";

import { getAssessment } from "./assessments.ts";
import { getCodedDiagnoses } from "./diagnosis-codings.ts";

// Gathers the PDGM inputs from an assessment (coded primary/secondary + functional answers) and
// runs the calculation. Returns null when the assessment doesn't exist.
export async function computeAssessmentPdgm(
  db: Db,
  assessmentId: string,
  timing: Timing,
  admissionSource: AdmissionSource,
): Promise<PdgmResult | null> {
  const coded = await getCodedDiagnoses(db, assessmentId);
  const assessment = await getAssessment(db, assessmentId);
  if (!coded || !assessment) return null;

  const codings = coded.flatMap((diagnosis) => (diagnosis.coding ? [diagnosis.coding] : []));
  const primaryIcd10 = codings.find((coding) => coding.isPrimary)?.icd10Code ?? null;
  const secondaryIcd10s = codings.filter((coding) => !coding.isPrimary).map((c) => c.icd10Code);
  const answers = Object.fromEntries(assessment.answers.map((a) => [a.itemCode, a.value]));

  return computePdgm({ primaryIcd10, secondaryIcd10s, answers, timing, admissionSource });
}

import type { Db } from "@ohmyscribe/db";
import {
  buildPdgmInput,
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
  return computePdgm(buildPdgmInput(coded, assessment.answers, timing, admissionSource));
}

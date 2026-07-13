import { useMemo } from "react";
import {
  buildPdgmInput,
  computePdgm,
  type AdmissionSource,
  type AssessmentDetail,
  type CodedDiagnosis,
  type PdgmResult,
  type Timing,
} from "@ohmyscribe/shared";

// The frozen snapshot once filed; before that, a live on-device compute over the locally-synced
// answers and codings, so the preview works offline and re-derives on every change.
export function useLocalPdgm(
  assessment: AssessmentDetail | undefined,
  codedDiagnoses: CodedDiagnosis[] | undefined,
  timing: Timing,
  admission: AdmissionSource,
): PdgmResult | null {
  return useMemo(() => {
    if (!assessment) return null;
    if (assessment.completedAt && assessment.pdgmSnapshot) return assessment.pdgmSnapshot;
    return computePdgm(buildPdgmInput(codedDiagnoses ?? [], assessment.answers, timing, admission));
  }, [assessment, codedDiagnoses, timing, admission]);
}

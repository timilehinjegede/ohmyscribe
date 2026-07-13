import { useMemo } from "react";
import { runQualityChecks, type AssessmentAnswer, type CodedDiagnosis } from "@ohmyscribe/shared";

// Derived on-device for live feedback; the server re-runs the same checks at file time as the
// gate of record, so these findings are never synced up.
export function useQualityChecks(
  answers: AssessmentAnswer[],
  codedDiagnoses: CodedDiagnosis[] | undefined,
) {
  return useMemo(() => {
    const codings = (codedDiagnoses ?? []).flatMap((diagnosis) =>
      diagnosis.coding ? [diagnosis.coding] : [],
    );
    const primaryIcd10 = codings.find((coding) => coding.isPrimary)?.icd10Code ?? null;
    const secondaryIcd10s = codings
      .filter((coding) => !coding.isPrimary)
      .map((coding) => coding.icd10Code);
    const answerValues = Object.fromEntries(
      answers.map((answer) => [answer.itemCode, answer.value]),
    );
    const findings = runQualityChecks({ answers: answerValues, primaryIcd10, secondaryIcd10s });
    return {
      findings,
      blockers: findings.filter((finding) => finding.severity === "blocker"),
      warnings: findings.filter((finding) => finding.severity !== "blocker"),
    };
  }, [answers, codedDiagnoses]);
}

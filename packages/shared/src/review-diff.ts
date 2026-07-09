import type { AnswerSuggestion, AssessmentAnswer } from "./assessment.ts";
import type { CodedDiagnosis } from "./diagnosis-coding.ts";

// The AI proposed a role the nurse never confirmed, or coded with the opposite role.
export function diagnosisDisagrees(
  diagnosis: Pick<CodedDiagnosis, "suggestion" | "coding">,
): boolean {
  if (!diagnosis.suggestion) return false;
  return !diagnosis.coding || diagnosis.coding.isPrimary !== diagnosis.suggestion.isPrimary;
}

export function countDiagnosisDisagreements(
  coded: Pick<CodedDiagnosis, "suggestion" | "coding">[],
): number {
  return coded.filter(diagnosisDisagrees).length;
}

// An unanswered suggested item counts too: the nurse neither accepted nor overrode the draft.
export function answerDisagrees(nurseValue: string | undefined, suggestedValue: string): boolean {
  return nurseValue !== suggestedValue;
}

export function countAnswerDisagreements(
  answers: Pick<AssessmentAnswer, "itemCode" | "value">[],
  suggestions: Pick<AnswerSuggestion, "itemCode" | "value">[],
): number {
  const answerValuesByItemCode = new Map(answers.map((answer) => [answer.itemCode, answer.value]));
  return suggestions.filter((suggestion) =>
    answerDisagrees(answerValuesByItemCode.get(suggestion.itemCode), suggestion.value),
  ).length;
}

export function reviewDiffSummary(
  coded: Pick<CodedDiagnosis, "suggestion" | "coding">[],
  answers: Pick<AssessmentAnswer, "itemCode" | "value">[],
  suggestions: Pick<AnswerSuggestion, "itemCode" | "value">[],
): { diagnosisDisagreements: number; answerDisagreements: number; total: number } {
  const diagnosisDisagreements = countDiagnosisDisagreements(coded);
  const answerDisagreements = countAnswerDisagreements(answers, suggestions);
  return {
    diagnosisDisagreements,
    answerDisagreements,
    total: diagnosisDisagreements + answerDisagreements,
  };
}

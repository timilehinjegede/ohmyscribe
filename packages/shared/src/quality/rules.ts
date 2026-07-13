import { getOasisItem, getOasisResponse } from "../oasis/catalog.ts";
import { FUNCTIONAL_ITEMS } from "../pdgm/calculator.ts";

export type QualityKind = "contradiction" | "missing";
export type QualitySeverity = "blocker" | "warning";

// answers holds only answered items: absence means unanswered, never "".
export type QualityContext = {
  answers: Record<string, string>;
  primaryIcd10: string | null;
  secondaryIcd10s: string[];
};

export type QualityRule = {
  id: string;
  kind: QualityKind;
  severity: QualitySeverity;
  itemCode: string | null;
  evaluate: (context: QualityContext) => string | null;
};

export type QualityFinding = {
  ruleId: string;
  kind: QualityKind;
  severity: QualitySeverity;
  itemCode: string | null;
  message: string;
};

// The " " sentinel keeps an absent answer from ever matching a values list.
const answerIn = (context: QualityContext, itemCode: string, values: string[]) =>
  values.includes(context.answers[itemCode] ?? " ");

const labelFor = (itemCode: string, value: string | undefined) =>
  getOasisResponse(itemCode, value)?.label ?? value ?? "not answered";

// Catalog response values the contradiction rules pivot on, named so the
// conditions read as the sentences they encode.
const M1700_ALERT_ORIENTED_INDEPENDENT = "0";
const M1710_CONFUSED_CONSTANTLY_OR_NONRESPONSIVE = ["4", "NA"];
const M1720_NONRESPONSIVE = "NA";
const M1840_TRANSFERS_TO_TOILET_INDEPENDENTLY = "0";
const M1850_TRANSFERS_INDEPENDENTLY_OR_MINIMAL_ASSIST = ["0", "1"];
const M1850_BEDFAST = ["4", "5"];
const M1860_WALKS_INDEPENDENTLY_OR_ONE_HANDED_DEVICE = ["0", "1"];
const M1860_BEDFAST = "6";

// An unanswered functional item scores zero points, so the PDGM functional level understates
// impairment until it's recorded — one warning per unanswered item.
const functionalMissingRules: QualityRule[] = FUNCTIONAL_ITEMS.map((itemCode) => ({
  id: `missing-functional:${itemCode}`,
  kind: "missing",
  severity: "warning",
  itemCode,
  evaluate: (context) =>
    context.answers[itemCode] === undefined
      ? `${itemCode} ${getOasisItem(itemCode)?.label ?? ""} is unanswered. The PDGM functional score understates impairment until it's recorded.`
      : null,
}));

export const QUALITY_RULES: QualityRule[] = [
  {
    id: "missing-primary-diagnosis",
    kind: "missing",
    severity: "blocker",
    itemCode: null,
    evaluate: (context) =>
      context.primaryIcd10 === null
        ? "No primary diagnosis is coded. A primary diagnosis is required to file. It drives the PDGM clinical group."
        : null,
  },
  ...functionalMissingRules,
  {
    id: "contradiction-bedfast-ambulation-independent-transfer",
    kind: "contradiction",
    severity: "warning",
    itemCode: "M1860",
    evaluate: (context) =>
      answerIn(context, "M1860", [M1860_BEDFAST]) &&
      answerIn(context, "M1850", M1850_TRANSFERS_INDEPENDENTLY_OR_MINIMAL_ASSIST)
        ? `M1860 Ambulation is "Bedfast" but M1850 Transferring is "${labelFor("M1850", context.answers.M1850)}". A bedfast patient cannot transfer independently.`
        : null,
  },
  {
    id: "contradiction-bedfast-transfer-independent-ambulation",
    kind: "contradiction",
    severity: "warning",
    itemCode: "M1850",
    evaluate: (context) =>
      answerIn(context, "M1850", M1850_BEDFAST) &&
      answerIn(context, "M1860", M1860_WALKS_INDEPENDENTLY_OR_ONE_HANDED_DEVICE)
        ? `M1850 Transferring is "${labelFor("M1850", context.answers.M1850)}" (bedfast) but M1860 Ambulation is "${labelFor("M1860", context.answers.M1860)}". These are inconsistent.`
        : null,
  },
  {
    id: "contradiction-toilet-independent-vs-bedfast-transfer",
    kind: "contradiction",
    severity: "warning",
    itemCode: "M1840",
    evaluate: (context) =>
      answerIn(context, "M1840", [M1840_TRANSFERS_TO_TOILET_INDEPENDENTLY]) &&
      answerIn(context, "M1850", M1850_BEDFAST)
        ? `M1840 Toilet Transferring is "Transfers to toilet independently" but M1850 Transferring is "${labelFor("M1850", context.answers.M1850)}" (bedfast). These are inconsistent.`
        : null,
  },
  {
    id: "contradiction-cognition-intact-vs-confused",
    kind: "contradiction",
    severity: "warning",
    itemCode: "M1700",
    evaluate: (context) =>
      answerIn(context, "M1700", [M1700_ALERT_ORIENTED_INDEPENDENT]) &&
      (answerIn(context, "M1710", M1710_CONFUSED_CONSTANTLY_OR_NONRESPONSIVE) ||
        answerIn(context, "M1720", [M1720_NONRESPONSIVE]))
        ? `M1700 Cognitive Functioning is "Alert, oriented, independent" but ${answerIn(context, "M1710", M1710_CONFUSED_CONSTANTLY_OR_NONRESPONSIVE) ? `M1710 When Confused is "${labelFor("M1710", context.answers.M1710)}"` : `M1720 When Anxious is "Patient nonresponsive"`}. These are inconsistent.`
        : null,
  },
];

export function runQualityChecks(context: QualityContext): QualityFinding[] {
  const findings = QUALITY_RULES.flatMap((rule) => {
    const message = rule.evaluate(context);
    return message
      ? [
          {
            ruleId: rule.id,
            kind: rule.kind,
            severity: rule.severity,
            itemCode: rule.itemCode,
            message,
          },
        ]
      : [];
  });
  // Blockers first; the sort is stable, so declaration order holds within each severity.
  return findings.sort(
    (first, second) => Number(second.severity === "blocker") - Number(first.severity === "blocker"),
  );
}

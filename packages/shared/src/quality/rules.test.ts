import { expect, test } from "bun:test";
import { getOasisItem, getOasisResponse } from "../oasis/catalog.ts";
import { FUNCTIONAL_ITEMS } from "../pdgm/calculator.ts";
import { QUALITY_RULES, runQualityChecks, type QualityContext } from "./rules.ts";

const allFunctionalAnswered = Object.fromEntries(
  FUNCTIONAL_ITEMS.map((itemCode) => [itemCode, "0"]),
);

const context = (overrides: Partial<QualityContext>): QualityContext => ({
  answers: {},
  primaryIcd10: null,
  secondaryIcd10s: [],
  ...overrides,
});

const findingWithRule = (input: QualityContext, ruleId: string) =>
  runQualityChecks(input).find((finding) => finding.ruleId === ruleId);

test("no primary diagnosis fires the blocker; a coded primary clears it", () => {
  const withoutPrimary = runQualityChecks(context({ answers: allFunctionalAnswered }));
  const blocker = withoutPrimary.find((finding) => finding.ruleId === "missing-primary-diagnosis");
  expect(blocker?.severity).toBe("blocker");
  expect(blocker?.kind).toBe("missing");

  const withPrimary = runQualityChecks(
    context({ answers: allFunctionalAnswered, primaryIcd10: "I10" }),
  );
  expect(withPrimary).toHaveLength(0);
});

test("an unanswered functional item warns, naming the item", () => {
  const { M1860: omitted, ...withoutAmbulation } = allFunctionalAnswered;
  void omitted;
  const finding = findingWithRule(
    context({ answers: withoutAmbulation, primaryIcd10: "I10" }),
    "missing-functional:M1860",
  );
  expect(finding?.kind).toBe("missing");
  expect(finding?.severity).toBe("warning");
  expect(finding?.itemCode).toBe("M1860");
  expect(finding?.message).toContain("M1860");
});

test("all eight functional items answered produces no missing-functional warnings", () => {
  const findings = runQualityChecks(
    context({ answers: allFunctionalAnswered, primaryIcd10: "I10" }),
  );
  expect(findings.some((finding) => finding.ruleId.startsWith("missing-functional:"))).toBe(false);
});

test("bedfast ambulation with an independent transfer is a contradiction", () => {
  const fires = findingWithRule(
    context({ answers: { M1860: "6", M1850: "0" }, primaryIcd10: "I10" }),
    "contradiction-bedfast-ambulation-independent-transfer",
  );
  expect(fires?.kind).toBe("contradiction");
  expect(fires?.severity).toBe("warning");
  expect(fires?.itemCode).toBe("M1860");

  const consistent = findingWithRule(
    context({ answers: { M1860: "6", M1850: "3" }, primaryIcd10: "I10" }),
    "contradiction-bedfast-ambulation-independent-transfer",
  );
  expect(consistent).toBeUndefined();
});

test("bedfast transferring with independent ambulation is a contradiction", () => {
  const fires = findingWithRule(
    context({ answers: { M1850: "5", M1860: "0" }, primaryIcd10: "I10" }),
    "contradiction-bedfast-transfer-independent-ambulation",
  );
  expect(fires?.kind).toBe("contradiction");
  expect(fires?.itemCode).toBe("M1850");
});

test("independent toilet transfer with bedfast transferring is a contradiction", () => {
  const fires = findingWithRule(
    context({ answers: { M1840: "0", M1850: "4" }, primaryIcd10: "I10" }),
    "contradiction-toilet-independent-vs-bedfast-transfer",
  );
  expect(fires?.kind).toBe("contradiction");
  expect(fires?.itemCode).toBe("M1840");
});

test("intact cognition with constant confusion or a nonresponsive patient is a contradiction", () => {
  const constantlyConfused = findingWithRule(
    context({ answers: { M1700: "0", M1710: "4" }, primaryIcd10: "I10" }),
    "contradiction-cognition-intact-vs-confused",
  );
  expect(constantlyConfused?.kind).toBe("contradiction");

  const occasionallyConfused = findingWithRule(
    context({ answers: { M1700: "0", M1710: "1" }, primaryIcd10: "I10" }),
    "contradiction-cognition-intact-vs-confused",
  );
  expect(occasionallyConfused).toBeUndefined();

  const nonresponsiveWhenAnxious = findingWithRule(
    context({ answers: { M1700: "0", M1720: "NA" }, primaryIcd10: "I10" }),
    "contradiction-cognition-intact-vs-confused",
  );
  expect(nonresponsiveWhenAnxious?.message).toContain("M1720");
});

test("runQualityChecks orders blockers before warnings", () => {
  const findings = runQualityChecks(context({ answers: {} }));
  expect(findings[0]?.ruleId).toBe("missing-primary-diagnosis");
  expect(findings[0]?.severity).toBe("blocker");
  expect(findings.slice(1).every((finding) => finding.severity === "warning")).toBe(true);
});

test("there is one missing-functional rule per PDGM functional item", () => {
  const missingFunctionalRuleIds = QUALITY_RULES.filter((rule) =>
    rule.id.startsWith("missing-functional:"),
  ).map((rule) => rule.id);
  expect(missingFunctionalRuleIds).toEqual(
    FUNCTIONAL_ITEMS.map((itemCode) => `missing-functional:${itemCode}`),
  );
});

test("every rule's anchor item and referenced response values exist in the catalog", () => {
  for (const rule of QUALITY_RULES) {
    if (rule.itemCode !== null) {
      expect(getOasisItem(rule.itemCode), rule.id).toBeDefined();
    }
  }
  // Every (item, value) pair a contradiction rule matches on must stay a real catalog response,
  // so a catalog edit that renames or drops a value breaks this test.
  const referencedResponses: [string, string][] = [
    ["M1860", "6"],
    ["M1860", "0"],
    ["M1860", "1"],
    ["M1850", "0"],
    ["M1850", "1"],
    ["M1850", "4"],
    ["M1850", "5"],
    ["M1840", "0"],
    ["M1700", "0"],
    ["M1710", "4"],
    ["M1710", "NA"],
    ["M1720", "NA"],
  ];
  for (const [itemCode, value] of referencedResponses) {
    expect(getOasisResponse(itemCode, value), `${itemCode}=${value}`).toBeDefined();
  }
});

import { and, eq, inArray } from "drizzle-orm";
import { qualityFlags, type Db } from "@ohmyscribe/db";
import {
  buildClinicalInputs,
  QUALITY_RULES,
  type QualityContext,
  type QualityFinding,
} from "@ohmyscribe/shared";
import { getAssessment } from "./assessments.ts";
import { getCodedDiagnoses } from "./diagnosis-codings.ts";

// Drizzle's transaction object isn't assignable to Db (it has no $client); this is its type.
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function gatherQualityContext(
  db: Db,
  assessmentId: string,
): Promise<QualityContext | null> {
  const coded = await getCodedDiagnoses(db, assessmentId);
  const assessment = await getAssessment(db, assessmentId);
  if (!coded || !assessment) return null;
  return buildClinicalInputs(coded, assessment.answers);
}

const DETERMINISTIC_RULE_IDS = QUALITY_RULES.map((rule) => rule.id);

// Idempotent reconcile: upsert each fired finding (unresolving a re-fired one), then resolve
// flags whose rule no longer fires. Scoped to this engine's rule ids so flags written under
// other rule-id namespaces are never touched.
export async function persistQualityFlags(
  tx: Tx,
  assessmentId: string,
  findings: QualityFinding[],
) {
  const now = new Date();
  for (const finding of findings) {
    await tx
      .insert(qualityFlags)
      .values({
        assessmentId,
        ruleId: finding.ruleId,
        kind: finding.kind,
        itemCode: finding.itemCode,
        message: finding.message,
        resolved: false,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [qualityFlags.assessmentId, qualityFlags.ruleId],
        set: {
          kind: finding.kind,
          itemCode: finding.itemCode,
          message: finding.message,
          resolved: false,
          updatedAt: now,
        },
      });
  }

  const firedRuleIds = new Set(findings.map((finding) => finding.ruleId));
  const staleRuleIds = DETERMINISTIC_RULE_IDS.filter((ruleId) => !firedRuleIds.has(ruleId));
  if (staleRuleIds.length === 0) return;
  await tx
    .update(qualityFlags)
    .set({ resolved: true, updatedAt: now })
    .where(
      and(
        eq(qualityFlags.assessmentId, assessmentId),
        eq(qualityFlags.resolved, false),
        inArray(qualityFlags.ruleId, staleRuleIds),
      ),
    );
}

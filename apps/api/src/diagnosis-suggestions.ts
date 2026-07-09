import { and, eq, isNull } from "drizzle-orm";
import { assessments, diagnoses, diagnosisSuggestions, type Db } from "@ohmyscribe/db";
import { icd10ForSnomed } from "@ohmyscribe/shared";
import { recordAuditEvent } from "./audit.ts";

const SNOMED_SYSTEM = "http://snomed.info/sct";
const MAX_SECONDARY = 5; // OASIS M1023 allows up to five other diagnoses.

// The provider-agnostic seam between this orchestration and a concrete model call (see openai.ts).
export type DiagnosisForModel = {
  diagnosisId: string;
  display: string;
  onset: string | null;
  icd10: string | null;
};
export type CodingSuggestion = {
  primary: { diagnosisId: string; rationale: string; confidence: number } | null;
  secondaries: { diagnosisId: string; rationale: string; confidence: number }[];
};
export type CallCodingModel = (diagnoses: DiagnosisForModel[]) => Promise<CodingSuggestion>;

type Pick = { diagnosisId: string; isPrimary: boolean; rationale: string; confidence: number };

// Generates the AI's role suggestions for an assessment's diagnoses, once — cached, so a second
// call skips the model if any suggestion already exists (stable across sheet re-opens). Best-effort:
// a model failure leaves the table untouched, so the caller falls back to manual coding.
export async function suggestCoding(
  db: Db,
  assessmentId: string,
  callModel: CallCodingModel,
): Promise<void> {
  const [assessment] = await db
    .select({ visitId: assessments.visitId })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), isNull(assessments.deletedAt)));
  if (!assessment) return;

  const [existing] = await db
    .select({ id: diagnosisSuggestions.id })
    .from(diagnosisSuggestions)
    .where(
      and(
        eq(diagnosisSuggestions.assessmentId, assessmentId),
        isNull(diagnosisSuggestions.deletedAt),
      ),
    )
    .limit(1);
  if (existing) return;

  const rows = await db
    .select({
      diagnosisId: diagnoses.id,
      system: diagnoses.system,
      code: diagnoses.code,
      display: diagnoses.display,
      onset: diagnoses.onset,
    })
    .from(diagnoses)
    .where(and(eq(diagnoses.visitId, assessment.visitId), isNull(diagnoses.deletedAt)));
  if (rows.length === 0) return;

  const forModel: DiagnosisForModel[] = rows.map((row) => ({
    diagnosisId: row.diagnosisId,
    display: row.display ?? row.code,
    onset: row.onset?.toISOString() ?? null,
    icd10: row.system === SNOMED_SYSTEM ? (icd10ForSnomed(row.code)?.icd10 ?? null) : null,
  }));

  try {
    const suggestion = await callModel(forModel);
    const picks = selectPicks(suggestion, new Set(rows.map((row) => row.diagnosisId)));
    if (picks.length === 0) return;
    await db.transaction(async (tx) => {
      await tx
        .insert(diagnosisSuggestions)
        .values(picks.map((pick) => ({ assessmentId, ...pick })))
        .onConflictDoNothing();
      for (const pick of picks) {
        await recordAuditEvent(tx, {
          assessmentId,
          itemCode: pick.diagnosisId,
          event: "suggested",
          actorId: null,
        });
      }
    });
  } catch (error) {
    console.error("coding suggestion failed:", error);
  }
}

// Keeps only picks that map to a real diagnosis: one primary, then up to five distinct secondaries.
export function selectPicks(suggestion: CodingSuggestion, validIds: Set<string>): Pick[] {
  const picks: Pick[] = [];
  const taken = new Set<string>();
  const { primary } = suggestion;
  if (primary && validIds.has(primary.diagnosisId)) {
    picks.push({ ...primary, isPrimary: true });
    taken.add(primary.diagnosisId);
  }
  let secondaries = 0;
  for (const secondary of suggestion.secondaries) {
    if (secondaries >= MAX_SECONDARY) break;
    if (!validIds.has(secondary.diagnosisId) || taken.has(secondary.diagnosisId)) continue;
    picks.push({ ...secondary, isPrimary: false });
    taken.add(secondary.diagnosisId);
    secondaries++;
  }
  return picks;
}

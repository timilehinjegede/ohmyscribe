import { and, eq, isNull, lt, ne, sql } from "drizzle-orm";
import {
  assessments,
  diagnoses,
  diagnosisCodings,
  diagnosisSuggestions,
  type Db,
} from "@ohmyscribe/db";
import { icd10ForSnomed } from "@ohmyscribe/shared";

const SNOMED_SYSTEM = "http://snomed.info/sct";

export async function getCodedDiagnoses(db: Db, assessmentId: string) {
  const [assessment] = await db
    .select({ visitId: assessments.visitId })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), isNull(assessments.deletedAt)));
  if (!assessment) return null;

  const rows = await db
    .select({
      diagnosisId: diagnoses.id,
      system: diagnoses.system,
      code: diagnoses.code,
      display: diagnoses.display,
      onset: diagnoses.onset,
      codedIcd10: diagnosisCodings.icd10Code,
      codingIsPrimary: diagnosisCodings.isPrimary,
      suggestionIsPrimary: diagnosisSuggestions.isPrimary,
      suggestionRationale: diagnosisSuggestions.rationale,
      suggestionConfidence: diagnosisSuggestions.confidence,
    })
    .from(diagnoses)
    .leftJoin(
      diagnosisCodings,
      and(
        eq(diagnosisCodings.diagnosisId, diagnoses.id),
        eq(diagnosisCodings.assessmentId, assessmentId),
        isNull(diagnosisCodings.deletedAt),
      ),
    )
    .leftJoin(
      diagnosisSuggestions,
      and(
        eq(diagnosisSuggestions.diagnosisId, diagnoses.id),
        eq(diagnosisSuggestions.assessmentId, assessmentId),
        isNull(diagnosisSuggestions.deletedAt),
      ),
    )
    .where(and(eq(diagnoses.visitId, assessment.visitId), isNull(diagnoses.deletedAt)))
    // Onset-ranked (nulls last): onset is the grounding signal for the primary suggestion.
    .orderBy(sql`${diagnoses.onset} desc nulls last`, diagnoses.id);

  return rows.map((row) => ({
    diagnosisId: row.diagnosisId,
    system: row.system,
    code: row.code,
    display: row.display,
    onset: row.onset?.toISOString() ?? null,
    suggestedCode: row.system === SNOMED_SYSTEM ? icd10ForSnomed(row.code) : null,
    suggestion:
      row.suggestionIsPrimary === null
        ? null
        : {
            isPrimary: row.suggestionIsPrimary,
            rationale: row.suggestionRationale,
            confidence: row.suggestionConfidence,
          },
    coding: row.codedIcd10
      ? { icd10Code: row.codedIcd10, isPrimary: row.codingIsPrimary ?? false }
      : null,
  }));
}

// Returns false when the diagnosis isn't in this assessment's visit.
export async function upsertCoding(
  db: Db,
  assessmentId: string,
  coding: { diagnosisId: string; icd10Code: string; isPrimary: boolean; updatedAt: string },
): Promise<boolean> {
  const updatedAt = new Date(coding.updatedAt);
  return db.transaction(async (tx) => {
    // The FK proves the diagnosis exists, not that it belongs to this assessment's visit.
    const [valid] = await tx
      .select({ id: diagnoses.id })
      .from(diagnoses)
      .innerJoin(assessments, eq(assessments.visitId, diagnoses.visitId))
      .where(
        and(
          eq(assessments.id, assessmentId),
          eq(diagnoses.id, coding.diagnosisId),
          isNull(diagnoses.deletedAt),
        ),
      );
    if (!valid) return false;

    // Will this write win LWW against any existing coding for the diagnosis? Gate the demote
    // on it: an out-of-order (stale) write must not clear the current primary and then have
    // its own promote rejected, leaving the assessment with zero primaries.
    const [existing] = await tx
      .select({ updatedAt: diagnosisCodings.updatedAt })
      .from(diagnosisCodings)
      .where(
        and(
          eq(diagnosisCodings.assessmentId, assessmentId),
          eq(diagnosisCodings.diagnosisId, coding.diagnosisId),
        ),
      );
    const promoteWins = !existing || updatedAt > existing.updatedAt;

    if (coding.isPrimary && promoteWins) {
      // Setting a new primary returns the old one to the suggestion pool (soft-delete), not
      // silently to the secondaries — the nurse re-adds it as a secondary only if they mean to.
      await tx
        .update(diagnosisCodings)
        .set({ isPrimary: false, deletedAt: updatedAt, updatedAt })
        .where(
          and(
            eq(diagnosisCodings.assessmentId, assessmentId),
            eq(diagnosisCodings.isPrimary, true),
            ne(diagnosisCodings.diagnosisId, coding.diagnosisId),
            isNull(diagnosisCodings.deletedAt),
          ),
        );
    }
    await tx
      .insert(diagnosisCodings)
      .values({
        assessmentId,
        diagnosisId: coding.diagnosisId,
        icd10Code: coding.icd10Code,
        isPrimary: coding.isPrimary,
        updatedAt,
      })
      // Revive a soft-deleted coding (deleted_at = null); last-write-wins on the device clock.
      .onConflictDoUpdate({
        target: [diagnosisCodings.assessmentId, diagnosisCodings.diagnosisId],
        set: {
          icd10Code: sql`excluded.icd10_code`,
          isPrimary: sql`excluded.is_primary`,
          deletedAt: sql`null`,
          updatedAt: sql`excluded.updated_at`,
        },
        setWhere: sql`excluded.updated_at > ${diagnosisCodings.updatedAt}`,
      });
    return true;
  });
}

export async function removeCoding(
  db: Db,
  assessmentId: string,
  diagnosisId: string,
  updatedAt: string,
): Promise<void> {
  const when = new Date(updatedAt);
  await db
    .update(diagnosisCodings)
    .set({ deletedAt: when, updatedAt: when })
    .where(
      and(
        eq(diagnosisCodings.assessmentId, assessmentId),
        eq(diagnosisCodings.diagnosisId, diagnosisId),
        isNull(diagnosisCodings.deletedAt),
        // Last-write-wins, symmetric with upsertCoding: a stale remove must not clobber a newer save.
        lt(diagnosisCodings.updatedAt, when),
      ),
    );
}

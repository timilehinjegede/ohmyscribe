import { randomUUID } from "expo-crypto";
import type { AssessmentDetail, CodedDiagnosis } from "@ohmyscribe/shared";

import type { AnswerRow, CodingRow } from "@/db/rows";
import { allRows, localRow, writeAuthored } from "@/db/sqlite";
import { localAssessment, localCodedDiagnoses } from "@/db/views";

async function assessmentDetail(assessmentId: string): Promise<AssessmentDetail> {
  const assessment = await localRow<{ visitId: string }>("assessments", assessmentId);
  const detail = assessment ? await localAssessment(assessment.visitId) : null;
  if (!detail) throw new Error("assessment not found locally");
  return detail;
}

// Reuse the (assessment, item) row's id, including a soft-deleted one, so the push upserts the same
// server row rather than colliding on its natural key.
export async function saveAnswerLocal(
  assessmentId: string,
  answer: { itemCode: string; value: string },
): Promise<AssessmentDetail> {
  const rows = await allRows<AnswerRow>("assessment_answers");
  const existing = rows.find(
    (row) => row.assessmentId === assessmentId && row.itemCode === answer.itemCode,
  );
  await writeAuthored("assessment_answers", {
    id: existing?.id ?? randomUUID(),
    assessmentId,
    itemCode: answer.itemCode,
    value: answer.value,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  });
  return assessmentDetail(assessmentId);
}

// Mirrors upsertCoding: a winning primary returns the current primary to the suggestion pool
// (soft-delete), and re-adding reuses/revives the existing row's id.
export async function saveCodingLocal(
  assessmentId: string,
  coding: { diagnosisId: string; icd10Code: string; isPrimary: boolean },
): Promise<CodedDiagnosis[]> {
  const now = new Date().toISOString();
  const forAssessment = (await allRows<CodingRow>("diagnosis_codings")).filter(
    (row) => row.assessmentId === assessmentId,
  );
  const existing = forAssessment.find((row) => row.diagnosisId === coding.diagnosisId);
  const promoteWins = !existing || now > existing.updatedAt;

  if (coding.isPrimary && promoteWins) {
    const currentPrimary = forAssessment.find(
      (row) => row.isPrimary && row.deletedAt === null && row.diagnosisId !== coding.diagnosisId,
    );
    if (currentPrimary) {
      await writeAuthored("diagnosis_codings", {
        ...currentPrimary,
        isPrimary: false,
        deletedAt: now,
        updatedAt: now,
      });
    }
  }

  await writeAuthored("diagnosis_codings", {
    id: existing?.id ?? randomUUID(),
    assessmentId,
    diagnosisId: coding.diagnosisId,
    icd10Code: coding.icd10Code,
    isPrimary: coding.isPrimary,
    updatedAt: now,
    deletedAt: null,
  });
  return localCodedDiagnoses(assessmentId);
}

export async function removeCodingLocal(
  assessmentId: string,
  diagnosisId: string,
): Promise<CodedDiagnosis[]> {
  const now = new Date().toISOString();
  const existing = (await allRows<CodingRow>("diagnosis_codings")).find(
    (row) =>
      row.assessmentId === assessmentId &&
      row.diagnosisId === diagnosisId &&
      row.deletedAt === null,
  );
  if (existing) {
    await writeAuthored("diagnosis_codings", { ...existing, deletedAt: now, updatedAt: now });
  }
  return localCodedDiagnoses(assessmentId);
}

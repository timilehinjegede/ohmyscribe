import {
  icd10ForSnomed,
  type AssessmentDetail,
  type CodedDiagnosis,
  type VisitDetail,
  type VisitListItem,
} from "@ohmyscribe/shared";

import type {
  AnswerRow,
  AnswerSuggestionRow,
  AssessmentRow,
  CodingRow,
  DiagnosisRow,
  DiagnosisSuggestionRow,
  PatientRow,
  QualityFlagRow,
  TranscriptRow,
  VisitRow,
} from "@/db/rows";
import { localRow, localRows } from "@/db/sqlite";

const SNOMED_SYSTEM = "http://snomed.info/sct";

// Mirrors listVisits, newest first. A missing patient (unpulled or soft-deleted) leaves a null name
// rather than dropping the visit.
export async function localVisits(): Promise<VisitListItem[]> {
  const [visits, patients] = await Promise.all([
    localRows<VisitRow>("visits"),
    localRows<PatientRow>("patients"),
  ]);
  const nameById = new Map(patients.map((patient) => [patient.id, patient.name]));
  return visits
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((visit) => ({
      id: visit.id,
      patientId: visit.patientId,
      assignedUserId: visit.assignedUserId,
      type: visit.type,
      status: visit.status,
      scheduledAt: visit.scheduledAt,
      patientName: nameById.get(visit.patientId) ?? null,
    }));
}

// Mirrors getVisit; the answered / coded counts are over live rows only.
export async function localVisit(id: string): Promise<VisitDetail | null> {
  const visit = await localRow<VisitRow>("visits", id);
  if (!visit) return null;
  const [patients, diagnoses, assessments, answers, codings] = await Promise.all([
    localRows<PatientRow>("patients"),
    localRows<DiagnosisRow>("diagnoses"),
    localRows<AssessmentRow>("assessments"),
    localRows<AnswerRow>("assessment_answers"),
    localRows<CodingRow>("diagnosis_codings"),
  ]);
  const patient = patients.find((row) => row.id === visit.patientId) ?? null;
  const assessmentRow = assessments.find((row) => row.visitId === id) ?? null;
  return {
    id: visit.id,
    patientId: visit.patientId,
    assignedUserId: visit.assignedUserId,
    type: visit.type,
    status: visit.status,
    scheduledAt: visit.scheduledAt,
    patient: patient
      ? {
          id: patient.id,
          name: patient.name,
          dob: patient.dob,
          address: patient.address,
          referringPhysician: patient.referringPhysician,
        }
      : null,
    diagnoses: diagnoses
      .filter((row) => row.visitId === id)
      .map((row) => ({ id: row.id, system: row.system, code: row.code, display: row.display })),
    assessment: assessmentRow
      ? {
          id: assessmentRow.id,
          answeredCount: answers.filter((row) => row.assessmentId === assessmentRow.id).length,
          codedCount: codings.filter((row) => row.assessmentId === assessmentRow.id).length,
          completedAt: assessmentRow.completedAt,
          reviewStatus: assessmentRow.reviewStatus,
        }
      : null,
  };
}

// Unresolved flags for an assessment, as pulled from the server.
export async function localFlags(assessmentId: string): Promise<QualityFlagRow[]> {
  const flags = await localRows<QualityFlagRow>("quality_flags");
  return flags.filter((row) => row.assessmentId === assessmentId && !row.resolved);
}

// Mirrors getAssessment.
export async function localAssessment(visitId: string): Promise<AssessmentDetail | null> {
  const assessments = await localRows<AssessmentRow>("assessments");
  const assessment = assessments.find((row) => row.visitId === visitId);
  if (!assessment) return null;
  const [answers, suggestions, transcriptRows] = await Promise.all([
    localRows<AnswerRow>("assessment_answers"),
    localRows<AnswerSuggestionRow>("answer_suggestions"),
    localRows<TranscriptRow>("assessment_transcripts"),
  ]);
  const transcriptRow = transcriptRows.find((row) => row.assessmentId === assessment.id) ?? null;
  return {
    id: assessment.id,
    visitId: assessment.visitId,
    completedAt: assessment.completedAt,
    pdgmSnapshot: assessment.pdgmSnapshot,
    transcript: transcriptRow?.text ?? null,
    answers: answers
      .filter((row) => row.assessmentId === assessment.id)
      .map((row) => ({ itemCode: row.itemCode, value: row.value })),
    suggestions: suggestions
      .filter((row) => row.assessmentId === assessment.id && row.suggestedValue !== null)
      .map((row) => ({
        itemCode: row.itemCode,
        value: row.suggestedValue as string,
        transcriptSnippet: row.transcriptSnippet,
        snippetStart: row.snippetStart,
        snippetEnd: row.snippetEnd,
        confidence: row.confidence,
      })),
  };
}

// Mirrors getCodedDiagnoses: onset-ranked (nulls last), with the SNOMED→ICD-10 crosswalk hint.
export async function localCodedDiagnoses(assessmentId: string): Promise<CodedDiagnosis[]> {
  const assessments = await localRows<AssessmentRow>("assessments");
  const assessment = assessments.find((row) => row.id === assessmentId);
  if (!assessment) return [];
  const [diagnoses, codings, suggestions] = await Promise.all([
    localRows<DiagnosisRow>("diagnoses"),
    localRows<CodingRow>("diagnosis_codings"),
    localRows<DiagnosisSuggestionRow>("diagnosis_suggestions"),
  ]);
  return diagnoses
    .filter((row) => row.visitId === assessment.visitId)
    .sort((a, b) => {
      if (a.onset !== b.onset) {
        if (a.onset === null) return 1;
        if (b.onset === null) return -1;
        return a.onset < b.onset ? 1 : -1;
      }
      return a.id < b.id ? -1 : 1;
    })
    .map((diagnosis) => {
      const coding =
        codings.find(
          (row) => row.diagnosisId === diagnosis.id && row.assessmentId === assessmentId,
        ) ?? null;
      const suggestion =
        suggestions.find(
          (row) => row.diagnosisId === diagnosis.id && row.assessmentId === assessmentId,
        ) ?? null;
      return {
        diagnosisId: diagnosis.id,
        system: diagnosis.system,
        code: diagnosis.code,
        display: diagnosis.display,
        onset: diagnosis.onset,
        suggestedCode: diagnosis.system === SNOMED_SYSTEM ? icd10ForSnomed(diagnosis.code) : null,
        suggestion: suggestion
          ? {
              isPrimary: suggestion.isPrimary,
              rationale: suggestion.rationale,
              confidence: suggestion.confidence,
            }
          : null,
        coding: coding ? { icd10Code: coding.icd10Code, isPrimary: coding.isPrimary } : null,
      };
    });
}

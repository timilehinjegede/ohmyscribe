// All synced rows as stored in local SQLite in in json format.

import type { PdgmResult } from "@ohmyscribe/shared";

export type VisitRow = {
  id: string;
  patientId: string;
  assignedUserId: string | null;
  type: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
};

export type PatientRow = {
  id: string;
  name: string;
  dob: string | null;
  address: string | null;
  referringPhysician: string | null;
};

export type DiagnosisRow = {
  id: string;
  visitId: string;
  system: string;
  code: string;
  display: string | null;
  onset: string | null;
};

export type AssessmentRow = {
  id: string;
  visitId: string;
  completedAt: string | null;
  pdgmSnapshot: PdgmResult | null;
  reviewStatus: string | null;
};

export type AnswerRow = {
  id: string;
  assessmentId: string;
  itemCode: string;
  value: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type AnswerSuggestionRow = {
  assessmentId: string;
  itemCode: string;
  suggestedValue: string | null;
  transcriptSnippet: string | null;
  snippetStart: number | null;
  snippetEnd: number | null;
  confidence: number | null;
};

export type TranscriptRow = {
  id: string;
  assessmentId: string;
  text: string;
  createdAt: string;
};

export type CodingRow = {
  id: string;
  assessmentId: string;
  diagnosisId: string;
  icd10Code: string;
  isPrimary: boolean;
  updatedAt: string;
  deletedAt: string | null;
};

export type DiagnosisSuggestionRow = {
  assessmentId: string;
  diagnosisId: string;
  isPrimary: boolean;
  rationale: string | null;
  confidence: number | null;
};

export type QualityFlagRow = {
  id: string;
  assessmentId: string;
  ruleId: string;
  itemCode: string | null;
  kind: string;
  message: string;
  resolved: boolean;
};

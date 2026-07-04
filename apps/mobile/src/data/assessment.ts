import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import {
  assessmentDetailSchema,
  type AdmissionSource,
  type AssessmentDetail,
  type Timing,
} from "@ohmyscribe/shared";

import { API_URL } from "@/config";
import { HttpError } from "@/data/http";

async function openAssessment(visitId: string) {
  const res = await fetch(`${API_URL}/visits/${visitId}/assessment`, { method: "POST" });
  if (!res.ok) throw new HttpError(res.status, `open assessment failed (${res.status})`);
  return assessmentDetailSchema.parse(await res.json());
}

async function saveAnswer(assessmentId: string, answer: { itemCode: string; value: string }) {
  const res = await fetch(`${API_URL}/assessments/${assessmentId}/answers`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers: [{ ...answer, updatedAt: new Date().toISOString() }] }),
  });
  if (!res.ok) throw new HttpError(res.status, `save answer failed (${res.status})`);
  return assessmentDetailSchema.parse(await res.json());
}

// Create-or-return the visit's assessment; idempotent, so it doubles as the loader.
export function useAssessment(visitId: string) {
  return useQuery({
    queryKey: ["assessment", visitId],
    queryFn: () => openAssessment(visitId),
    enabled: Boolean(visitId),
  });
}

export function useSaveAnswer(visitId: string, assessmentId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["assessment", visitId];
  return useMutation({
    mutationFn: (answer: { itemCode: string; value: string }) => saveAnswer(assessmentId, answer),
    // Optimistic: reflect the tap immediately; the server's LWW is authoritative on persistence.
    onMutate: async (answer) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AssessmentDetail>(queryKey);
      if (previous) {
        const answers = previous.answers.filter(
          (existing) => existing.itemCode !== answer.itemCode,
        );
        queryClient.setQueryData<AssessmentDetail>(queryKey, {
          ...previous,
          answers: [...answers, answer],
        });
      }
      return { previous };
    },
    onSuccess: (_updated, _answer, context) => {
      if (context?.previous?.answers.length === 0) {
        queryClient.invalidateQueries({ queryKey: ["visits", visitId] });
      }
    },
    onError: (error, _answer, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      // A 409 means it was completed elsewhere — refetch so the wizard flips to read-only.
      if (error instanceof HttpError && error.status === 409) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}

type Completion = { timing: Timing; admissionSource: AdmissionSource };

async function completeAssessment(assessmentId: string, body: Completion) {
  const res = await fetch(`${API_URL}/assessments/${assessmentId}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new HttpError(res.status, `complete assessment failed (${res.status})`);
  return assessmentDetailSchema.parse(await res.json());
}

export function useCompleteAssessment(visitId: string, assessmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Completion) => completeAssessment(assessmentId, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(["assessment", visitId], updated);
      queryClient.invalidateQueries({ queryKey: ["visits", visitId] });
      queryClient.invalidateQueries({ queryKey: ["pdgm", assessmentId] });
    },
  });
}

async function extractFromAudio(assessmentId: string, uri: string) {
  // Expo SDK 57's FormData rejects React Native's { uri } file part, so upload via the native
  // multipart uploader instead of fetch + FormData.
  const result = await uploadAsync(`${API_URL}/assessments/${assessmentId}/extract-audio`, uri, {
    httpMethod: "POST",
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: "audio",
    mimeType: "audio/m4a",
  });
  if (result.status < 200 || result.status >= 300) {
    throw new HttpError(result.status, `extract failed (${result.status})`);
  }
}

export function useExtractAudio(visitId: string, assessmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uri: string) => extractFromAudio(assessmentId, uri),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assessment", visitId] }),
  });
}

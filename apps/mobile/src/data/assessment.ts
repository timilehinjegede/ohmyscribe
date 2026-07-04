import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assessmentDetailSchema, type AssessmentDetail } from "@ohmyscribe/shared";

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

async function completeAssessment(assessmentId: string) {
  const res = await fetch(`${API_URL}/assessments/${assessmentId}/complete`, { method: "POST" });
  if (!res.ok) throw new HttpError(res.status, `complete assessment failed (${res.status})`);
  return assessmentDetailSchema.parse(await res.json());
}

export function useCompleteAssessment(visitId: string, assessmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => completeAssessment(assessmentId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["assessment", visitId], updated);
      // Refresh the visit detail so its button flips to "Review".
      queryClient.invalidateQueries({ queryKey: ["visits", visitId] });
    },
  });
}

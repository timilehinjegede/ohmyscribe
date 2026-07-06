import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";
import type { AdmissionSource, AssessmentDetail, Timing } from "@ohmyscribe/shared";

import { API_URL } from "@/config";
import { pendingCount } from "@/db/sqlite";
import { localAssessment } from "@/db/views";
import { saveAnswerLocal } from "@/db/writes";
import { HttpError } from "@/data/http";
import { pullSync, pushSync, syncNow } from "@/sync";

// Local-first read; the server round-trip runs only when nothing's mirrored yet.
async function openAssessment(visitId: string): Promise<AssessmentDetail> {
  const local = await localAssessment(visitId);
  if (local) return local;
  try {
    await fetch(`${API_URL}/visits/${visitId}/assessment`, { method: "POST" });
    await pullSync();
  } catch {
    // offline and nothing local yet so we fall through to the error below
  }
  const detail = await localAssessment(visitId);
  if (!detail) throw new HttpError(503, "assessment not available offline");
  return detail;
}

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
    mutationFn: (answer: { itemCode: string; value: string }) =>
      saveAnswerLocal(assessmentId, answer),
    // Optimistic: reflect the tap immediately; the local write returns the authoritative view.
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
    onSuccess: (updated, _answer, context) => {
      queryClient.setQueryData(queryKey, updated);
      if (context?.previous?.answers.length === 0) {
        queryClient.invalidateQueries({ queryKey: ["visits", visitId] });
      }
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      void pushSync().then(() => queryClient.invalidateQueries({ queryKey: ["sync-status"] }));
    },
    onError: (_error, _answer, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
  });
}

type Completion = { timing: Timing; admissionSource: AdmissionSource };

// Filing needs the server (it snapshots the PDGM). Flush pending edits first AND confirm they landed;
// otherwise we'd freeze a snapshot missing the nurse's latest edits while showing success.
async function completeAssessment(assessmentId: string, body: Completion) {
  await pushSync();
  if ((await pendingCount()) > 0) {
    throw new HttpError(
      503,
      "Some edits haven't synced yet. Reconnect and try again before filing",
    );
  }
  const res = await fetch(`${API_URL}/assessments/${assessmentId}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new HttpError(res.status, `complete assessment failed (${res.status})`);
}

export function useCompleteAssessment(_visitId: string, assessmentId: string) {
  return useMutation({
    mutationFn: (body: Completion) => completeAssessment(assessmentId, body),
    // Pull the filed state (completedAt, snapshot, visit → complete) into local + refresh everything.
    onSuccess: () => syncNow(),
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
    // The drafts are generated server-side; pull them local, then refresh the assessment.
    onSuccess: async () => {
      await pullSync();
      queryClient.invalidateQueries({ queryKey: ["assessment", visitId] });
    },
  });
}

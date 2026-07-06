import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CodedDiagnosis } from "@ohmyscribe/shared";

import { API_URL } from "@/config";
import { localCodedDiagnoses } from "@/db/views";
import { removeCodingLocal, saveCodingLocal } from "@/db/writes";
import { HttpError } from "@/data/http";
import { pullSync, pushSync } from "@/sync";

type Coding = { diagnosisId: string; icd10Code: string; isPrimary: boolean };

async function suggestCoding(assessmentId: string) {
  const res = await fetch(`${API_URL}/assessments/${assessmentId}/suggest-coding`, {
    method: "POST",
  });
  if (!res.ok) throw new HttpError(res.status, `suggest coding failed (${res.status})`);
}

export function useCodedDiagnoses(assessmentId: string) {
  return useQuery({
    queryKey: ["coded-diagnoses", assessmentId],
    queryFn: () => localCodedDiagnoses(assessmentId),
    enabled: Boolean(assessmentId),
  });
}

// A save can touch other rows (a primary swap or a removal), so we take the write's recomputed view.
function useCodingMutation<TVariables>(
  visitId: string,
  assessmentId: string,
  mutationFn: (variables: TVariables) => Promise<CodedDiagnosis[]>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (view) => {
      queryClient.setQueryData(["coded-diagnoses", assessmentId], view);
      queryClient.invalidateQueries({ queryKey: ["visits", visitId] });
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      void pushSync().then(() => queryClient.invalidateQueries({ queryKey: ["sync-status"] }));
    },
  });
}

export function useSaveCoding(visitId: string, assessmentId: string) {
  return useCodingMutation(visitId, assessmentId, (coding: Coding) =>
    saveCodingLocal(assessmentId, coding),
  );
}

export function useRemoveCoding(visitId: string, assessmentId: string) {
  return useCodingMutation(visitId, assessmentId, (diagnosisId: string) =>
    removeCodingLocal(assessmentId, diagnosisId),
  );
}

// We fetch suggestion onlines and if offline/fails, the nurse just codes manually.
export function useSuggestCoding(assessmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => suggestCoding(assessmentId),
    // The drafts are generated server-side then we can pull them local, then refresh the coded view.
    onSuccess: async () => {
      await pullSync();
      queryClient.invalidateQueries({ queryKey: ["coded-diagnoses", assessmentId] });
    },
  });
}

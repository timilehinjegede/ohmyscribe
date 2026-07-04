import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { codedDiagnosisSchema, type CodedDiagnosis } from "@ohmyscribe/shared";

import { API_URL } from "@/config";
import { HttpError } from "@/data/http";

const codedDiagnosesSchema = z.array(codedDiagnosisSchema);
type Coding = { diagnosisId: string; icd10Code: string; isPrimary: boolean };

async function fetchCodedDiagnoses(assessmentId: string) {
  const res = await fetch(`${API_URL}/assessments/${assessmentId}/diagnoses`);
  if (!res.ok) throw new HttpError(res.status, `load diagnoses failed (${res.status})`);
  return codedDiagnosesSchema.parse(await res.json());
}

async function saveCoding(assessmentId: string, coding: Coding) {
  const res = await fetch(`${API_URL}/assessments/${assessmentId}/codings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...coding, updatedAt: new Date().toISOString() }),
  });
  if (!res.ok) throw new HttpError(res.status, `save coding failed (${res.status})`);
  return codedDiagnosesSchema.parse(await res.json());
}

async function removeCoding(assessmentId: string, diagnosisId: string) {
  const res = await fetch(`${API_URL}/assessments/${assessmentId}/codings/${diagnosisId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ updatedAt: new Date().toISOString() }),
  });
  if (!res.ok) throw new HttpError(res.status, `remove coding failed (${res.status})`);
  return codedDiagnosesSchema.parse(await res.json());
}

export function useCodedDiagnoses(assessmentId: string) {
  return useQuery({
    queryKey: ["coded-diagnoses", assessmentId],
    queryFn: () => fetchCodedDiagnoses(assessmentId),
    enabled: Boolean(assessmentId),
  });
}

// A save can touch other rows (a primary swap or a removal), so we trust the server's
// recomputed view instead of an optimistic guess.
function useCodingMutation<TVariables>(
  visitId: string,
  assessmentId: string,
  mutationFn: (variables: TVariables) => Promise<CodedDiagnosis[]>,
) {
  const queryClient = useQueryClient();
  const queryKey = ["coded-diagnoses", assessmentId];
  return useMutation({
    mutationFn,
    onSuccess: (view) => queryClient.setQueryData(queryKey, view),
    onError: (error) => {
      // Completed elsewhere: refetch codings and flip the wizard (assessment query) read-only.
      if (error instanceof HttpError && error.status === 409) {
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({ queryKey: ["assessment", visitId] });
      }
    },
  });
}

export function useSaveCoding(visitId: string, assessmentId: string) {
  return useCodingMutation(visitId, assessmentId, (coding: Coding) =>
    saveCoding(assessmentId, coding),
  );
}

export function useRemoveCoding(visitId: string, assessmentId: string) {
  return useCodingMutation(visitId, assessmentId, (diagnosisId: string) =>
    removeCoding(assessmentId, diagnosisId),
  );
}

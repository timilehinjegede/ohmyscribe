import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AdmissionSource, PdgmResult, Timing } from "@ohmyscribe/shared";

import { API_URL } from "@/config";
import { HttpError } from "@/data/http";

async function fetchPdgm(
  assessmentId: string,
  timing: Timing,
  admissionSource: AdmissionSource,
): Promise<PdgmResult> {
  const res = await fetch(
    `${API_URL}/assessments/${assessmentId}/pdgm?timing=${timing}&admissionSource=${admissionSource}`,
  );
  if (!res.ok) throw new HttpError(res.status, `pdgm failed (${res.status})`);
  return (await res.json()) as PdgmResult;
}

export function usePdgm(
  assessmentId: string,
  timing: Timing,
  admissionSource: AdmissionSource,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["pdgm", assessmentId, timing, admissionSource],
    queryFn: () => fetchPdgm(assessmentId, timing, admissionSource),
    enabled: Boolean(assessmentId) && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

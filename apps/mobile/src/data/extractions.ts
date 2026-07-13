import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getExtraction, retryExtraction } from "@/db/extractions";
import { drainExtractions } from "@/sync";

// The queued/failed recording behind the wizard's review banner, if any.
export function usePendingExtraction(assessmentId: string) {
  return useQuery({
    queryKey: ["pending-extraction", assessmentId],
    queryFn: () => getExtraction(assessmentId),
    enabled: Boolean(assessmentId),
  });
}

export function useRetryExtraction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assessmentId: string) => {
      await retryExtraction(assessmentId);
      await drainExtractions();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["pending-extraction"] });
    },
  });
}

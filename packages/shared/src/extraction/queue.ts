export const MAX_EXTRACTION_ATTEMPTS = 3;

export type PendingExtractionStatus = "queued" | "uploading" | "failed";

// Bad connectivity shouldn't eat retries: only a real server response counts as
// an attempt. A network throw just re-queues.
export function nextStatusAfterFailure(attempts: number): {
  attempts: number;
  status: "queued" | "failed";
} {
  const attemptsAfterFailure = attempts + 1;
  return {
    attempts: attemptsAfterFailure,
    status: attemptsAfterFailure >= MAX_EXTRACTION_ATTEMPTS ? "failed" : "queued",
  };
}

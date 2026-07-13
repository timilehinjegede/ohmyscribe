import { FileSystemUploadType, uploadAsync } from "expo-file-system/legacy";

import { API_URL } from "@/config";
import {
  claimQueuedExtractions,
  completeExtraction,
  failExtraction,
  markExtractionUploading,
  requeueExtraction,
  requeueStrandedUploads,
} from "@/db/extractions";
import { showToast } from "@/lib/toast";
import { queryClient } from "@/query-client";
import { pullSync } from "@/sync/pull";

let draining = false;

// Upload queued recordings to the extraction endpoint. Uses the native multipart uploader because
// Expo SDK 57's FormData rejects React Native's { uri } file part, and inspects the HTTP status
// instead of throwing so terminal rejections (409, 404) can be told apart from a retryable error.
export async function drainExtractions(): Promise<void> {
  if (draining) return;
  draining = true;
  let uploaded = false;
  let draftedCount = 0;
  try {
    await requeueStrandedUploads();
    for (const extraction of await claimQueuedExtractions()) {
      if (!(await markExtractionUploading(extraction.assessmentId))) continue; // claimed elsewhere
      let responseStatus: number;
      let responseBody: string;
      try {
        const response = await uploadAsync(
          `${API_URL}/assessments/${extraction.assessmentId}/extract-audio`,
          extraction.fileUri,
          {
            httpMethod: "POST",
            uploadType: FileSystemUploadType.MULTIPART,
            fieldName: "audio",
            mimeType: "audio/m4a",
          },
        );
        responseStatus = response.status;
        responseBody = response.body;
      } catch {
        // Offline/timeout: re-queue without burning an attempt, mirroring pushSync.
        await requeueExtraction(extraction.assessmentId);
        continue;
      }
      if (responseStatus >= 200 && responseStatus < 300) {
        await completeExtraction(extraction.assessmentId);
        uploaded = true;
        try {
          draftedCount += Number(JSON.parse(responseBody).drafted) || 0;
        } catch {
          // Unreadable success body: keep the pull, skip the draft count.
        }
      } else if (responseStatus === 409 || responseStatus === 404) {
        // Filed before the recording drained (409) or unknown to the server (404): either way
        // the draft can never land, drop it silently.
        await completeExtraction(extraction.assessmentId);
      } else {
        await failExtraction(extraction.assessmentId);
      }
    }
  } finally {
    draining = false;
  }
  if (uploaded) {
    // The server persisted the transcript (and any answer_suggestions); pull them local.
    await pullSync();
    queryClient.invalidateQueries();
    if (draftedCount > 0) showToast("AI drafts ready");
  }
}

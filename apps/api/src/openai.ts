import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { CallCodingModel } from "./diagnosis-suggestions.ts";

// The model picks from the supplied diagnoses by id; the caller re-validates the ids
// (structured output guarantees the JSON shape, not that an id is real).
const codingSuggestionSchema = z.object({
  primary: z
    .object({ diagnosisId: z.string(), rationale: z.string(), confidence: z.number() })
    .nullable(),
  secondaries: z.array(
    z.object({ diagnosisId: z.string(), rationale: z.string(), confidence: z.number() }),
  ),
});

const systemPrompt = `You are a home-health OASIS coding assistant. From a patient's referral diagnoses, choose the primary diagnosis (OASIS M1021 — the single chief reason home health is being provided, the focus of the plan of care) and up to five secondary diagnoses (M1023 — other conditions relevant to the plan of care).

Rules:
- Exactly one primary, or null if none is a defensible focus of care.
- The primary must not be an external-cause code (ICD-10 beginning V, W, X, or Y).
- Include only diagnoses that plausibly shape the plan of care; omit incidental ones.
- A more recent onset often marks the active, care-driving condition.

Choose only from the supplied diagnoses, by diagnosisId. For each choice give a one-sentence rationale and a confidence from 0 to 1.`;

let client: OpenAI | null = null;

// Lazy: importing this module must not require the key (tests inject a stub CallCodingModel).
export const callCodingModel: CallCodingModel = async (diagnoses) => {
  client ??= new OpenAI();
  const completion = await client.chat.completions.parse({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(diagnoses) },
    ],
    response_format: zodResponseFormat(codingSuggestionSchema, "coding_suggestion"),
  });
  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) throw new Error("model returned no structured output");
  return parsed;
};

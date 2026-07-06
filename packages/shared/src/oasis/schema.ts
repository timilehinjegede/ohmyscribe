import { z } from "zod";

import { getOasisResponse, OASIS_ITEMS, type OasisItemCode } from "./catalog.ts";

// z.enum needs a literal tuple; deriving it from the catalog keeps codes from drifting.
export const oasisItemCodeSchema = z.enum(
  OASIS_ITEMS.map((item) => item.code) as [OasisItemCode, ...OasisItemCode[]],
);

// A single answered item: value must be one of that item's allowed response codes.
// Unanswered items are omitted from the answers array, never submitted with a blank value.
export const oasisAnswerSchema = z
  .object({
    itemCode: oasisItemCodeSchema,
    value: z.string().min(1),
  })
  .refine((answer) => getOasisResponse(answer.itemCode, answer.value) !== undefined, {
    message: "value is not a valid response for this item",
    path: ["value"],
  });
export type OasisAnswer = z.infer<typeof oasisAnswerSchema>;

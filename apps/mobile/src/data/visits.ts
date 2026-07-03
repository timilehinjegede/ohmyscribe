import { useQuery } from "@tanstack/react-query";
import { visitDetailSchema, visitListItemSchema } from "@ohmyscribe/shared";
import { z } from "zod";

import { API_URL } from "@/config";
import { HttpError } from "@/data/http";

// The data-access seam: fetches + validates the API response now, reads local
// SQLite later. Hooks and screens depend on these functions, not on the source.
async function fetchVisits() {
  const res = await fetch(`${API_URL}/visits`);
  if (!res.ok) throw new HttpError(res.status, `GET /visits failed (${res.status})`);
  return z.array(visitListItemSchema).parse(await res.json());
}

async function fetchVisit(id: string) {
  const res = await fetch(`${API_URL}/visits/${id}`);
  if (!res.ok) throw new HttpError(res.status, `GET /visits/${id} failed (${res.status})`);
  return visitDetailSchema.parse(await res.json());
}

export function useVisits() {
  return useQuery({ queryKey: ["visits"], queryFn: fetchVisits });
}

export function useVisit(id: string) {
  return useQuery({
    queryKey: ["visits", id],
    queryFn: () => fetchVisit(id),
    enabled: Boolean(id),
  });
}

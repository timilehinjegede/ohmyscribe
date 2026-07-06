import { useQuery } from "@tanstack/react-query";
import { localVisit, localVisits } from "@/db/views";

export function useVisits() {
  return useQuery({ queryKey: ["visits"], queryFn: localVisits });
}

export function useVisit(id: string) {
  return useQuery({
    queryKey: ["visits", id],
    queryFn: () => localVisit(id),
    enabled: Boolean(id),
  });
}

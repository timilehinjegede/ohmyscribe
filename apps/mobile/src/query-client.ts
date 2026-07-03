import { QueryClient } from "@tanstack/react-query";
import { ZodError } from "zod";

import { HttpError } from "@/data/http";

// Don't retry deterministic failures: a Zod parse error (contract drift) or a 4xx
// won't fix itself on retry, surface it fast instead of backing off three times.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (error instanceof ZodError) return false;
        if (error instanceof HttpError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

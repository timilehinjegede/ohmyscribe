import { Badge } from "@/components/badge";
import { titleCase } from "@/lib/format";

export function VisitStatusBadge({ status }: { status: string }) {
  return <Badge label={titleCase(status)} tone={status === "complete" ? "success" : "accent"} />;
}

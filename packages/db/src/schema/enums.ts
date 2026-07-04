import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["RN", "PT", "OT", "SLP"]);
export const visitType = pgEnum("visit_type", ["SOC", "ROC", "Recert", "Discharge", "Other"]);
export const visitStatus = pgEnum("visit_status", ["open", "complete"]);
export const answerSuggestionStatus = pgEnum("answer_suggestion_status", [
  "pending",
  "accepted",
  "overridden",
]);
export const answerSuggestionSource = pgEnum("answer_suggestion_source", ["audio"]);
export const qualityFlagKind = pgEnum("quality_flag_kind", [
  "contradiction",
  "nurse_vs_ai",
  "missing",
]);
export const auditEvent = pgEnum("audit_event", ["suggested", "accepted", "overridden"]);
export const referralStatus = pgEnum("referral_status", ["ingested", "rejected"]);

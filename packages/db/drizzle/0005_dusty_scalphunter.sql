DROP INDEX IF EXISTS "assessments_visit_id_idx";--> statement-breakpoint
ALTER TABLE "assessment_answers" ALTER COLUMN "value" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_visit_id_unique" UNIQUE("visit_id");
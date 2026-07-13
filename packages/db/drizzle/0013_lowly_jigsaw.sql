CREATE TYPE "public"."review_status" AS ENUM('pending_review', 'approved', 'returned');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'reviewer';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessment_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "assessment_transcripts_assessment_id_unique" UNIQUE("assessment_id")
);
--> statement-breakpoint
ALTER TABLE "answer_suggestions" ADD COLUMN "snippet_start" integer;--> statement-breakpoint
ALTER TABLE "answer_suggestions" ADD COLUMN "snippet_end" integer;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "review_status" "review_status";--> statement-breakpoint
ALTER TABLE "quality_flags" ADD COLUMN "rule_id" text NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_transcripts" ADD CONSTRAINT "assessment_transcripts_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_transcripts_server_seq_idx" ON "assessment_transcripts" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_transcripts_assessment_id_idx" ON "assessment_transcripts" USING btree ("assessment_id");--> statement-breakpoint
ALTER TABLE "quality_flags" ADD CONSTRAINT "quality_flags_assessment_rule_unique" UNIQUE("assessment_id","rule_id");
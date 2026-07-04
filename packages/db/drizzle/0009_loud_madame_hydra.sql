CREATE TABLE IF NOT EXISTS "answer_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"suggested_value" text,
	"rationale" text,
	"transcript_snippet" text,
	"confidence" real,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"source" "suggestion_source" DEFAULT 'audio' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnosis_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"diagnosis_id" uuid NOT NULL,
	"is_primary" boolean NOT NULL,
	"rationale" text,
	"confidence" real,
	CONSTRAINT "diagnosis_suggestions_assessment_diagnosis_unique" UNIQUE("assessment_id","diagnosis_id")
);
--> statement-breakpoint
DROP TABLE "suggestions" CASCADE;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "answer_suggestions" ADD CONSTRAINT "answer_suggestions_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnosis_suggestions" ADD CONSTRAINT "diagnosis_suggestions_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnosis_suggestions" ADD CONSTRAINT "diagnosis_suggestions_diagnosis_id_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."diagnoses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "answer_suggestions_server_seq_idx" ON "answer_suggestions" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "answer_suggestions_assessment_id_idx" ON "answer_suggestions" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnosis_suggestions_server_seq_idx" ON "diagnosis_suggestions" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnosis_suggestions_assessment_id_idx" ON "diagnosis_suggestions" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "diagnosis_suggestions_one_primary_idx" ON "diagnosis_suggestions" USING btree ("assessment_id") WHERE is_primary and deleted_at is null;
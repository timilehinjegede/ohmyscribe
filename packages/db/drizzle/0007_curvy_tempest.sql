CREATE TABLE IF NOT EXISTS "diagnosis_codings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"diagnosis_id" uuid NOT NULL,
	"icd10_code" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"coded_by_id" uuid,
	CONSTRAINT "diagnosis_codings_assessment_diagnosis_unique" UNIQUE("assessment_id","diagnosis_id")
);
--> statement-breakpoint
ALTER TABLE "diagnoses" ADD COLUMN "onset" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnosis_codings" ADD CONSTRAINT "diagnosis_codings_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnosis_codings" ADD CONSTRAINT "diagnosis_codings_diagnosis_id_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."diagnoses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnosis_codings" ADD CONSTRAINT "diagnosis_codings_coded_by_id_users_id_fk" FOREIGN KEY ("coded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnosis_codings_server_seq_idx" ON "diagnosis_codings" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnosis_codings_assessment_id_idx" ON "diagnosis_codings" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "diagnosis_codings_one_primary_idx" ON "diagnosis_codings" USING btree ("assessment_id") WHERE is_primary and deleted_at is null;
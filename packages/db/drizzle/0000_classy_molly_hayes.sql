CREATE TYPE "public"."audit_event" AS ENUM('suggested', 'accepted', 'overridden');--> statement-breakpoint
CREATE TYPE "public"."quality_flag_kind" AS ENUM('contradiction', 'nurse_vs_ai', 'missing');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('ingested', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."suggestion_source" AS ENUM('audio');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'accepted', 'overridden');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('RN', 'PT', 'OT', 'SLP');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('open', 'complete');--> statement-breakpoint
CREATE TYPE "public"."visit_type" AS ENUM('SOC', 'ROC', 'Recert', 'Discharge', 'Other');--> statement-breakpoint
CREATE SEQUENCE "public"."sync_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessment_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"value" text,
	"entered_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visit_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"assessment_id" uuid NOT NULL,
	"item_code" text,
	"event" "audit_event" NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"dob" date,
	"address" text,
	"referring_physician" text,
	"source" text DEFAULT 'synthea' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"patient_id" uuid NOT NULL,
	"assigned_user_id" uuid,
	"type" "visit_type" NOT NULL,
	"scheduled_at" timestamp with time zone,
	"status" "visit_status" DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suggestions" (
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
CREATE TABLE IF NOT EXISTS "quality_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"item_code" text,
	"kind" "quality_flag_kind" NOT NULL,
	"message" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raw_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"status" "referral_status" NOT NULL,
	"error_reason" text,
	"patient_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_entered_by_id_users_id_fk" FOREIGN KEY ("entered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessments" ADD CONSTRAINT "assessments_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visits" ADD CONSTRAINT "visits_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visits" ADD CONSTRAINT "visits_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quality_flags" ADD CONSTRAINT "quality_flags_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raw_referrals" ADD CONSTRAINT "raw_referrals_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_answers_server_seq_idx" ON "assessment_answers" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_answers_assessment_id_idx" ON "assessment_answers" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessments_server_seq_idx" ON "assessments" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessments_visit_id_idx" ON "assessments" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_server_seq_idx" ON "audit_logs" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_assessment_id_idx" ON "audit_logs" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_server_seq_idx" ON "users" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patients_server_seq_idx" ON "patients" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visits_server_seq_idx" ON "visits" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visits_patient_id_idx" ON "visits" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visits_assigned_user_id_idx" ON "visits" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestions_server_seq_idx" ON "suggestions" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suggestions_assessment_id_idx" ON "suggestions" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quality_flags_server_seq_idx" ON "quality_flags" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quality_flags_assessment_id_idx" ON "quality_flags" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_referrals_status_idx" ON "raw_referrals" USING btree ("status");
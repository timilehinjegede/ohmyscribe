CREATE TABLE IF NOT EXISTS "diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visit_id" uuid NOT NULL,
	"system" text NOT NULL,
	"code" text NOT NULL,
	"display" text,
	CONSTRAINT "diagnoses_visit_code_unique" UNIQUE("visit_id","system","code")
);
--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "raw_referrals" ADD COLUMN "content_hash" text NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnoses_server_seq_idx" ON "diagnoses" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnoses_visit_id_idx" ON "diagnoses" USING btree ("visit_id");--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_external_id_unique" UNIQUE("external_id");--> statement-breakpoint
ALTER TABLE "raw_referrals" ADD CONSTRAINT "raw_referrals_content_hash_unique" UNIQUE("content_hash");
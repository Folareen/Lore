CREATE TABLE "case_ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"case_version" integer NOT NULL,
	"generation" integer NOT NULL,
	"kind" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendation" jsonb,
	"indexed_count" integer DEFAULT 0 NOT NULL,
	"eligible_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"input_fingerprint" text NOT NULL,
	"label" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"storage_key" text,
	"file_name" text,
	"content_type" text,
	"byte_length" integer,
	"checksum" text,
	"file_state" text,
	"upload_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_evidence_request_unique" UNIQUE("channel_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "case_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"action" text NOT NULL,
	"actor_twitch_user_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_history_version_unique" UNIQUE("case_id","version")
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"created_by_twitch_user_id" text NOT NULL,
	"title" text NOT NULL,
	"subject_reference" text NOT NULL,
	"incident" text NOT NULL,
	"appeal" text NOT NULL,
	"incident_at" timestamp with time zone,
	"rule_title" text NOT NULL,
	"rule_version" text NOT NULL,
	"rule_text" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"origin" text DEFAULT 'manual_import' NOT NULL,
	"outcome" text,
	"rationale" text,
	"follow_up" text,
	"ai_run_id" uuid,
	"ai_disposition" text,
	"decision_request_id" uuid,
	"decided_by_twitch_user_id" text,
	"decided_at" timestamp with time zone,
	"embedding" vector(768),
	"embedding_version" integer,
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_channel_id_unique" UNIQUE("channel_id","id"),
	CONSTRAINT "cases_request_unique" UNIQUE("channel_id","request_id"),
	CONSTRAINT "cases_state_valid" CHECK ("cases"."status" IN ('open','reviewing','decided') AND "cases"."version" > 0),
	CONSTRAINT "cases_decision_valid" CHECK (("cases"."status"='decided') = ("cases"."outcome" IS NOT NULL AND "cases"."rationale" IS NOT NULL AND "cases"."decided_by_twitch_user_id" IS NOT NULL AND "cases"."decided_at" IS NOT NULL)),
	CONSTRAINT "cases_origin_valid" CHECK ("cases"."origin" IN ('manual_import','live_twitch','demo_fixture'))
);
--> statement-breakpoint
ALTER TABLE "evidence" DROP CONSTRAINT "evidence_team_confirmed";--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "case_ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "case_ai_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "case_ai_runs" ADD CONSTRAINT "case_ai_runs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_ai_runs" ADD CONSTRAINT "case_ai_run_case_fk" FOREIGN KEY ("channel_id","case_id") REFERENCES "public"."cases"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_case_fk" FOREIGN KEY ("channel_id","case_id") REFERENCES "public"."cases"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_proof_fk" FOREIGN KEY ("channel_id","evidence_id") REFERENCES "public"."evidence"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_history" ADD CONSTRAINT "case_history_case_fk" FOREIGN KEY ("channel_id","case_id") REFERENCES "public"."cases"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_ai_run_pending_idx" ON "case_ai_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "case_ai_run_case_idx" ON "case_ai_runs" USING btree ("channel_id","case_id","created_at");--> statement-breakpoint
CREATE INDEX "case_evidence_cleanup_idx" ON "case_evidence" USING btree ("file_state","upload_expires_at");--> statement-breakpoint
CREATE INDEX "cases_channel_time_idx" ON "cases" USING btree ("channel_id","created_at","id");--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_team_confirmed" CHECK ("evidence"."visibility" IN ('team', 'private_moderation') AND "evidence"."retention_state" = 'confirmed');
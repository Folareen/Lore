CREATE TABLE "ai_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"source_event_id" text NOT NULL,
	"kind" text NOT NULL,
	"draft" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"model" text NOT NULL,
	"review_request_id" uuid,
	"reviewed_by_twitch_user_id" text,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"confirmed_open_loop_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_candidates_source_kind_unique" UNIQUE("channel_id","source_event_id","kind"),
	CONSTRAINT "ai_candidates_state_valid" CHECK ("ai_candidates"."status" IN ('pending', 'confirmed', 'dismissed', 'expired') AND "ai_candidates"."version" > 0),
	CONSTRAINT "ai_candidates_confirmation" CHECK (("ai_candidates"."status" = 'confirmed') = ("ai_candidates"."confirmed_open_loop_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ai_daily_usage" (
	"channel_id" uuid NOT NULL,
	"day" date NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_daily_usage_channel_id_day_pk" PRIMARY KEY("channel_id","day"),
	CONSTRAINT "ai_daily_usage_positive" CHECK ("ai_daily_usage"."calls" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_run_sources" (
	"channel_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"source_event_id" text NOT NULL,
	CONSTRAINT "ai_run_sources_channel_id_source_event_id_pk" PRIMARY KEY("channel_id","source_event_id")
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_runs_channel_id_unique" UNIQUE("channel_id","id")
);
--> statement-breakpoint
ALTER TABLE "open_loops" DROP CONSTRAINT "open_loops_capture_origin";--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "ai_extraction_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "ai_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_candidates" ADD CONSTRAINT "ai_candidates_run_fk" FOREIGN KEY ("channel_id","run_id") REFERENCES "public"."ai_runs"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_candidates" ADD CONSTRAINT "ai_candidates_source_fk" FOREIGN KEY ("channel_id","source_event_id") REFERENCES "public"."source_events"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_candidates" ADD CONSTRAINT "ai_candidates_loop_fk" FOREIGN KEY ("channel_id","confirmed_open_loop_id") REFERENCES "public"."open_loops"("channel_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_daily_usage" ADD CONSTRAINT "ai_daily_usage_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_sources" ADD CONSTRAINT "ai_run_sources_run_fk" FOREIGN KEY ("channel_id","run_id") REFERENCES "public"."ai_runs"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_sources" ADD CONSTRAINT "ai_run_sources_event_fk" FOREIGN KEY ("channel_id","source_event_id") REFERENCES "public"."source_events"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_candidates_channel_status_idx" ON "ai_candidates" USING btree ("channel_id","status","id");--> statement-breakpoint
CREATE INDEX "ai_runs_pending_idx" ON "ai_runs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "ai_runs_channel_time_idx" ON "ai_runs" USING btree ("channel_id","created_at");--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_capture_origin" CHECK (("open_loops"."capture_method" IN ('chat_command', 'ai_review') AND "open_loops"."origin" = 'live_twitch') OR ("open_loops"."capture_method" = 'dashboard' AND "open_loops"."origin" IN ('manual_import', 'demo_fixture')));
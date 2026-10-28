CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"source_event_id" text,
	"excerpt" text NOT NULL,
	"origin" text NOT NULL,
	"visibility" text DEFAULT 'team' NOT NULL,
	"retention_state" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_channel_id_unique" UNIQUE("channel_id","id"),
	CONSTRAINT "evidence_team_confirmed" CHECK ("evidence"."visibility" = 'team' AND "evidence"."retention_state" = 'confirmed')
);
--> statement-breakpoint
CREATE TABLE "open_loop_history" (
	"channel_id" uuid NOT NULL,
	"open_loop_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_twitch_user_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_loop_history_channel_id_open_loop_id_version_pk" PRIMARY KEY("channel_id","open_loop_id","version")
);
--> statement-breakpoint
CREATE TABLE "open_loops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"wording" text NOT NULL,
	"owner_label" text,
	"due_context" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"origin" text NOT NULL,
	"capture_method" text NOT NULL,
	"capture_key" text NOT NULL,
	"evidence_id" uuid NOT NULL,
	"last_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_loops_channel_id_unique" UNIQUE("channel_id","id"),
	CONSTRAINT "open_loops_capture_unique" UNIQUE("channel_id","capture_method","capture_key"),
	CONSTRAINT "open_loops_status_valid" CHECK ("open_loops"."status" IN ('candidate', 'confirmed', 'in_progress', 'fulfilled', 'postponed', 'cancelled')),
	CONSTRAINT "open_loops_terminal_reason" CHECK ("open_loops"."status" NOT IN ('fulfilled', 'cancelled') OR length(trim("open_loops"."last_reason")) > 0 AND "open_loops"."last_reason" IS NOT NULL),
	CONSTRAINT "open_loops_version_positive" CHECK ("open_loops"."version" > 0),
	CONSTRAINT "open_loops_capture_origin" CHECK (("open_loops"."capture_method" = 'chat_command' AND "open_loops"."origin" = 'live_twitch') OR ("open_loops"."capture_method" = 'dashboard' AND "open_loops"."origin" IN ('manual_import', 'demo_fixture')))
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_loop_history" ADD CONSTRAINT "open_loop_history_channel_loop_fk" FOREIGN KEY ("channel_id","open_loop_id") REFERENCES "public"."open_loops"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_channel_evidence_fk" FOREIGN KEY ("channel_id","evidence_id") REFERENCES "public"."evidence"("channel_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "open_loops_channel_status_idx" ON "open_loops" USING btree ("channel_id","status");--> statement-breakpoint
CREATE INDEX "open_loops_channel_time_idx" ON "open_loops" USING btree ("channel_id","created_at","id");
CREATE TABLE "catchup_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"generation" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "catchup_message_unique" UNIQUE("channel_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "public_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"input_fingerprint" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"chat_summary" text NOT NULL,
	"promise_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"approved_by_twitch_user_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_entry_channel_id_unique" UNIQUE("channel_id","id"),
	CONSTRAINT "public_entry_request_unique" UNIQUE("channel_id","request_id"),
	CONSTRAINT "public_entry_state_valid" CHECK ("public_entries"."version">0 AND "public_entries"."status" IN ('draft','published','unpublished','deleted') AND "public_entries"."kind" IN ('milestone','reference','story','commitment','summary')),
	CONSTRAINT "public_entry_approval_required" CHECK ("public_entries"."status"!='published' OR ("public_entries"."approved_by_twitch_user_id" IS NOT NULL AND "public_entries"."published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "public_entry_sources" (
	"channel_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "public_entry_sources_entry_id_source_id_pk" PRIMARY KEY("entry_id","source_id"),
	CONSTRAINT "public_entry_no_self_source" CHECK ("public_entry_sources"."entry_id"!="public_entry_sources"."source_id")
);
--> statement-breakpoint
CREATE TABLE "publication_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"action" text NOT NULL,
	"actor_twitch_user_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_history_version_unique" UNIQUE("entry_id","version")
);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "catchup_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "catchup_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "catchup_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "last_catchup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "catchup_replies" ADD CONSTRAINT "catchup_replies_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_entries" ADD CONSTRAINT "public_entries_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_entries" ADD CONSTRAINT "public_entries_channel_id_promise_id_open_loops_channel_id_id_fk" FOREIGN KEY ("channel_id","promise_id") REFERENCES "public"."open_loops"("channel_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_entry_sources" ADD CONSTRAINT "public_entry_sources_channel_id_entry_id_public_entries_channel_id_id_fk" FOREIGN KEY ("channel_id","entry_id") REFERENCES "public"."public_entries"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_entry_sources" ADD CONSTRAINT "public_entry_sources_channel_id_source_id_public_entries_channel_id_id_fk" FOREIGN KEY ("channel_id","source_id") REFERENCES "public"."public_entries"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_history" ADD CONSTRAINT "publication_history_channel_id_entry_id_public_entries_channel_id_id_fk" FOREIGN KEY ("channel_id","entry_id") REFERENCES "public"."public_entries"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catchup_pending_idx" ON "catchup_replies" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "public_entry_channel_time_idx" ON "public_entries" USING btree ("channel_id","published_at","id");
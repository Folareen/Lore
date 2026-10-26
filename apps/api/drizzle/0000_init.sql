CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"twitch_channel_id" text,
	"display_name" text NOT NULL,
	"origin" text NOT NULL,
	"chat_retention_days" integer DEFAULT 7 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_slug_unique" UNIQUE("slug"),
	CONSTRAINT "channels_twitch_channel_id_unique" UNIQUE("twitch_channel_id"),
	CONSTRAINT "channels_retention_bootstrap_limit" CHECK ("channels"."chat_retention_days" BETWEEN 1 AND 7),
	CONSTRAINT "channels_origin_valid" CHECK ("channels"."origin" IN ('live_twitch', 'manual_import', 'demo_fixture'))
);

CREATE TABLE "overlay_tokens" (
	"channel_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text,
	"version" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"mode" text DEFAULT 'recap' NOT NULL,
	"entry_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "overlay_mode_check" CHECK ("overlay_tokens"."mode" IN ('recap','open_loops')),
	CONSTRAINT "overlay_version_check" CHECK ("overlay_tokens"."version">=0)
);
--> statement-breakpoint
ALTER TABLE "overlay_tokens" ADD CONSTRAINT "overlay_tokens_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
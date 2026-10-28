CREATE TABLE "chat_messages" (
	"channel_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"source_event_id" text NOT NULL,
	"chatter_id" text NOT NULL,
	"text" text NOT NULL,
	"badges" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chat_messages_channel_id_message_id_pk" PRIMARY KEY("channel_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "source_events" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL,
	"subscription_id" text NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"origin" text DEFAULT 'live_twitch' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	CONSTRAINT "source_events_channel_id_unique" UNIQUE("channel_id","id"),
	CONSTRAINT "source_events_origin_private" CHECK ("source_events"."origin" = 'live_twitch' AND "source_events"."visibility" = 'private')
);
--> statement-breakpoint
CREATE TABLE "twitch_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "capture_requested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "capture_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "capture_error" text;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD COLUMN "expected_user_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_source_fk" FOREIGN KEY ("channel_id","source_event_id") REFERENCES "public"."source_events"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twitch_subscriptions" ADD CONSTRAINT "twitch_subscriptions_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_expiry_idx" ON "chat_messages" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "source_events_pending_idx" ON "source_events" USING btree ("processed_at","failed_at","created_at");--> statement-breakpoint
CREATE INDEX "source_events_channel_time_idx" ON "source_events" USING btree ("channel_id","occurred_at");--> statement-breakpoint
CREATE INDEX "source_events_tombstone_idx" ON "source_events" USING btree ("channel_id","type","occurred_at") WHERE "source_events"."type" IN ('channel.chat.message_delete', 'channel.chat.clear', 'channel.chat.clear_user_messages');--> statement-breakpoint
CREATE INDEX "source_events_expiry_idx" ON "source_events" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "twitch_subscriptions_channel_idx" ON "twitch_subscriptions" USING btree ("channel_id");--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_expected_user_id_users_id_fk" FOREIGN KEY ("expected_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
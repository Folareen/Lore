CREATE TYPE "public"."membership_role" AS ENUM('moderator', 'team');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_id" uuid NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"verification_state" text DEFAULT 'owner_approved' NOT NULL,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id"),
	CONSTRAINT "memberships_owner_approved" CHECK ("memberships"."verification_state" = 'owner_approved'),
	CONSTRAINT "memberships_owner_separate" CHECK ("memberships"."user_id" != "memberships"."granted_by")
);
--> statement-breakpoint
CREATE TABLE "oauth_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_tokens" text,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"validated_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_tokens_active_only" CHECK (("oauth_connections"."revoked_at" IS NULL) = ("oauth_connections"."encrypted_tokens" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"browser_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"twitch_user_id" text NOT NULL,
	"login" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_twitch_user_id_unique" UNIQUE("twitch_user_id"),
	CONSTRAINT "users_identity_unique" UNIQUE("id","twitch_user_id")
);
--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "disconnected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_owner_unique" UNIQUE("id","owner_user_id");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_granting_owner_fk" FOREIGN KEY ("channel_id","granted_by") REFERENCES "public"."channels"("id","owner_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_connections" ADD CONSTRAINT "oauth_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_channel_time_idx" ON "audit_events" USING btree ("channel_id","occurred_at");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_states_expiry_idx" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_twitch_owner_fk" FOREIGN KEY ("owner_user_id","twitch_channel_id") REFERENCES "public"."users"("id","twitch_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channels_owner_idx" ON "channels" USING btree ("owner_user_id");--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_live_owner_required" CHECK ("channels"."origin" != 'live_twitch' OR ("channels"."owner_user_id" IS NOT NULL AND "channels"."twitch_channel_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_connection_owner_required" CHECK ("channels"."connected_at" IS NULL OR ("channels"."owner_user_id" IS NOT NULL AND "channels"."twitch_channel_id" IS NOT NULL));
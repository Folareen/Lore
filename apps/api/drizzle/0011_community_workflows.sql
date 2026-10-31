CREATE TABLE "case_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"source_event_id" text NOT NULL,
	"case_id" uuid NOT NULL,
	"external_key" text NOT NULL,
	CONSTRAINT "case_import_external_unique" UNIQUE("channel_id","external_key")
);
--> statement-breakpoint
CREATE TABLE "microphone_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"source_event_id" text NOT NULL,
	"transcript" text,
	"drafts" jsonb,
	"decisions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "open_loops" DROP CONSTRAINT "open_loops_capture_origin";--> statement-breakpoint
ALTER TABLE "source_events" DROP CONSTRAINT "source_events_origin_private";--> statement-breakpoint
ALTER TABLE "catchup_replies" ADD COLUMN "kind" text DEFAULT 'catchup' NOT NULL;--> statement-breakpoint
ALTER TABLE "catchup_replies" ADD COLUMN "open_loop_id" uuid;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "moderation_imports_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "moderation_imports_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "promise_confirmations_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "promise_confirmations_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "last_promise_confirmation_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "public_summary_ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "microphone_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "features_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "workspace_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "case_imports" ADD CONSTRAINT "case_imports_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_imports" ADD CONSTRAINT "case_import_case_fk" FOREIGN KEY ("channel_id","case_id") REFERENCES "public"."cases"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microphone_captures" ADD CONSTRAINT "microphone_captures_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microphone_captures" ADD CONSTRAINT "microphone_source_fk" FOREIGN KEY ("channel_id","source_event_id") REFERENCES "public"."source_events"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "microphone_channel_expiry_idx" ON "microphone_captures" USING btree ("channel_id","expires_at");--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_capture_origin" CHECK (("open_loops"."capture_method" = 'chat_command' AND "open_loops"."origin" = 'live_twitch') OR ("open_loops"."capture_method" = 'ai_review' AND "open_loops"."origin" IN ('live_twitch', 'manual_import')) OR ("open_loops"."capture_method" = 'dashboard' AND "open_loops"."origin" IN ('manual_import', 'demo_fixture')));--> statement-breakpoint
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_origin_private" CHECK ("source_events"."origin" IN ('live_twitch', 'manual_import') AND "source_events"."visibility" = 'private');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION lore_channel_features() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.disconnected_at IS NOT NULL OR NEW.connected_at IS NULL THEN
    NEW.moderation_imports_enabled := false; NEW.promise_confirmations_enabled := false;
    NEW.public_summary_ai_enabled := false; NEW.microphone_enabled := false;
  END IF;
  IF NOT NEW.capture_requested THEN NEW.moderation_imports_enabled := false; NEW.promise_confirmations_enabled := false; END IF;
  IF ROW(NEW.moderation_imports_enabled, NEW.promise_confirmations_enabled, NEW.public_summary_ai_enabled, NEW.microphone_enabled, NEW.disconnected_at) IS DISTINCT FROM ROW(OLD.moderation_imports_enabled, OLD.promise_confirmations_enabled, OLD.public_summary_ai_enabled, OLD.microphone_enabled, OLD.disconnected_at) THEN
    NEW.features_generation := OLD.features_generation + 1;
  END IF;
  NEW.workspace_revision := OLD.workspace_revision + 1;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER lore_channel_features_before BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION lore_channel_features();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION lore_workspace_changed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE channel uuid;
BEGIN
  IF TG_TABLE_NAME = 'source_events' THEN
    IF COALESCE(NEW.type, OLD.type) NOT IN ('stream.online', 'stream.offline') THEN RETURN NULL; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN channel := OLD.channel_id; ELSE channel := NEW.channel_id; END IF;
  UPDATE channels SET workspace_revision = workspace_revision + 1 WHERE id = channel;
  RETURN NULL;
END $$;

--> statement-breakpoint
CREATE TRIGGER lore_workspace_memberships AFTER INSERT OR UPDATE OR DELETE ON memberships FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_open_loops AFTER INSERT OR UPDATE OR DELETE ON open_loops FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_ai_candidates AFTER INSERT OR UPDATE OR DELETE ON ai_candidates FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_cases AFTER INSERT OR UPDATE OR DELETE ON cases FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_case_evidence AFTER INSERT OR UPDATE OR DELETE ON case_evidence FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_case_ai_runs AFTER INSERT OR UPDATE OR DELETE ON case_ai_runs FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_repair_actions AFTER INSERT OR UPDATE OR DELETE ON repair_actions FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_consistency_flags AFTER INSERT OR UPDATE OR DELETE ON consistency_flags FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_handoffs AFTER INSERT OR UPDATE OR DELETE ON handoffs FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_handoff_items AFTER INSERT OR UPDATE OR DELETE ON handoff_items FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_rule_changes AFTER INSERT OR UPDATE OR DELETE ON rule_changes FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_public_entries AFTER INSERT OR UPDATE OR DELETE ON public_entries FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_overlay_tokens AFTER INSERT OR UPDATE OR DELETE ON overlay_tokens FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_microphone_captures AFTER INSERT OR UPDATE OR DELETE ON microphone_captures FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

--> statement-breakpoint
CREATE TRIGGER lore_workspace_source_events AFTER INSERT OR UPDATE OR DELETE ON source_events FOR EACH ROW EXECUTE FUNCTION lore_workspace_changed();

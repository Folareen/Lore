CREATE TABLE "consistency_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"compared_case_id" uuid,
	"case_version" integer NOT NULL,
	"compared_version" integer,
	"request_id" uuid NOT NULL,
	"input_fingerprint" text NOT NULL,
	"comparison_key" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"origin" text NOT NULL,
	"concern" text NOT NULL,
	"review_note" text,
	"severity_context" text DEFAULT '' NOT NULL,
	"evidence_context" text DEFAULT '' NOT NULL,
	"reviewed_by_twitch_user_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flag_request_unique" UNIQUE("channel_id","request_id"),
	CONSTRAINT "flag_comparison_unique" UNIQUE("channel_id","comparison_key"),
	CONSTRAINT "flag_state_valid" CHECK ("consistency_flags"."version">0 AND "consistency_flags"."status" IN ('open','confirmed','dismissed') AND "consistency_flags"."origin" IN ('human','documented_outcome_comparison')),
	CONSTRAINT "flag_review_valid" CHECK ("consistency_flags"."status"='open' OR ("consistency_flags"."review_note" IS NOT NULL AND "consistency_flags"."reviewed_by_twitch_user_id" IS NOT NULL AND "consistency_flags"."reviewed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "handoff_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"handoff_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"source_version" integer NOT NULL,
	"title" text NOT NULL,
	"assignee_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handoff_source_unique" UNIQUE("handoff_id","source_type","source_id"),
	CONSTRAINT "handoff_item_state_valid" CHECK ("handoff_items"."version">0 AND "handoff_items"."source_version">0 AND "handoff_items"."source_type" IN ('case','repair','flag') AND "handoff_items"."status" IN ('pending','acknowledged','resolved'))
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"input_fingerprint" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"summary" text NOT NULL,
	"created_by_twitch_user_id" text NOT NULL,
	"recent_decisions" jsonb NOT NULL,
	"rule_contexts" jsonb NOT NULL,
	"rule_changes" jsonb NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handoff_channel_id_unique" UNIQUE("channel_id","id"),
	CONSTRAINT "handoff_request_unique" UNIQUE("channel_id","request_id"),
	CONSTRAINT "handoff_period_valid" CHECK ("handoffs"."period_start"<="handoffs"."period_end")
);
--> statement-breakpoint
CREATE TABLE "moderation_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"case_id" uuid,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_twitch_user_id" text NOT NULL,
	"note" text,
	"assignee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"input_fingerprint" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"agreement" text NOT NULL,
	"assignee_id" uuid,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"completion_note" text,
	"evidence_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repair_channel_id_unique" UNIQUE("channel_id","id"),
	CONSTRAINT "repair_request_unique" UNIQUE("channel_id","request_id"),
	CONSTRAINT "repair_state_valid" CHECK ("repair_actions"."version">0 AND "repair_actions"."status" IN ('pending','in_progress','completed','cancelled') AND "repair_actions"."kind" IN ('follow_up','repair','re_entry')),
	CONSTRAINT "repair_completion_valid" CHECK ("repair_actions"."status" NOT IN ('completed','cancelled') OR ("repair_actions"."completion_note" IS NOT NULL AND length(trim("repair_actions"."completion_note"))>0))
);
--> statement-breakpoint
CREATE TABLE "rule_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"input_fingerprint" text NOT NULL,
	"title" text NOT NULL,
	"previous_version" text NOT NULL,
	"version" text NOT NULL,
	"rule_text" text NOT NULL,
	"change_summary" text NOT NULL,
	"actor_twitch_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_change_request_unique" UNIQUE("channel_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_channel_id_unique" UNIQUE("channel_id","id");--> statement-breakpoint
ALTER TABLE "consistency_flags" ADD CONSTRAINT "consistency_flags_channel_id_case_id_cases_channel_id_id_fk" FOREIGN KEY ("channel_id","case_id") REFERENCES "public"."cases"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consistency_flags" ADD CONSTRAINT "consistency_flags_channel_id_compared_case_id_cases_channel_id_id_fk" FOREIGN KEY ("channel_id","compared_case_id") REFERENCES "public"."cases"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_items" ADD CONSTRAINT "handoff_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_items" ADD CONSTRAINT "handoff_items_channel_id_handoff_id_handoffs_channel_id_id_fk" FOREIGN KEY ("channel_id","handoff_id") REFERENCES "public"."handoffs"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_items" ADD CONSTRAINT "handoff_items_channel_id_case_id_cases_channel_id_id_fk" FOREIGN KEY ("channel_id","case_id") REFERENCES "public"."cases"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_activity" ADD CONSTRAINT "moderation_activity_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_activity" ADD CONSTRAINT "moderation_activity_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_activity" ADD CONSTRAINT "moderation_activity_channel_id_case_id_cases_channel_id_id_fk" FOREIGN KEY ("channel_id","case_id") REFERENCES "public"."cases"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_actions" ADD CONSTRAINT "repair_actions_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_actions" ADD CONSTRAINT "repair_actions_channel_id_case_id_cases_channel_id_id_fk" FOREIGN KEY ("channel_id","case_id") REFERENCES "public"."cases"("channel_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_actions" ADD CONSTRAINT "repair_actions_channel_id_evidence_id_case_evidence_channel_id_id_fk" FOREIGN KEY ("channel_id","evidence_id") REFERENCES "public"."case_evidence"("channel_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_changes" ADD CONSTRAINT "rule_changes_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flag_channel_time_idx" ON "consistency_flags" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "handoff_channel_time_idx" ON "handoffs" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "moderation_activity_channel_time_idx" ON "moderation_activity" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "repair_channel_time_idx" ON "repair_actions" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "rule_change_channel_time_idx" ON "rule_changes" USING btree ("channel_id","created_at");--> statement-breakpoint

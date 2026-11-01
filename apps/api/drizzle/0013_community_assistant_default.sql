ALTER TABLE "channels" ALTER COLUMN "community_assistant_enabled" SET DEFAULT true;
--> statement-breakpoint
-- Preserve deliberate owner choices while upgrading the previous default.
UPDATE "channels" SET "community_assistant_enabled" = true,
  "features_generation" = "features_generation" + 1
WHERE "community_assistant_enabled" = false
  AND NOT EXISTS (
    SELECT 1 FROM "audit_events"
    WHERE "audit_events"."channel_id" = "channels"."id"
      AND "audit_events"."action" IN (
        'feature.communityAssistantEnabled.enabled',
        'feature.communityAssistantEnabled.disabled'
      )
  );

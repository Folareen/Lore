CREATE TABLE "publication_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"storage_key" text,
	"alt" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_image_state" CHECK ("publication_images"."state" IN ('pending','ready','removed'))
);
--> statement-breakpoint
ALTER TABLE "public_entries" ADD COLUMN "clip_id" text;--> statement-breakpoint
ALTER TABLE "public_entries" ADD COLUMN "screenshot_id" uuid;--> statement-breakpoint
ALTER TABLE "publication_images" ADD CONSTRAINT "publication_images_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_images" ADD CONSTRAINT "publication_images_channel_id_entry_id_public_entries_channel_id_id_fk" FOREIGN KEY ("channel_id","entry_id") REFERENCES "public"."public_entries"("channel_id","id") ON DELETE no action ON UPDATE no action;
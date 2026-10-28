import { sql } from 'drizzle-orm';
import type { InfrastructureService } from '../infrastructure.service';
type Executor = Pick<InfrastructureService['db'], 'execute'>;
// Scrub model-derived chat as well as raw chat. Confirmation preserves a separately retained evidence copy.
export async function expireCandidates(tx: Executor, channelId?: string) {
  await tx.execute(
    sql`UPDATE ai_candidates a SET draft = NULL, status = CASE WHEN a.status = 'pending' THEN 'expired' ELSE a.status END, version = a.version + 1, updated_at = now() WHERE a.draft IS NOT NULL AND (${channelId || null}::uuid IS NULL OR a.channel_id = ${channelId || null}::uuid) AND (a.expires_at <= now() OR NOT EXISTS (SELECT 1 FROM source_events s JOIN chat_messages m ON m.channel_id = s.channel_id AND m.source_event_id = s.id JOIN channels c ON c.id = s.channel_id WHERE s.channel_id = a.channel_id AND s.id = a.source_event_id AND s.payload IS NOT NULL AND s.expires_at > now() AND m.expires_at > now() AND m.occurred_at + c.chat_retention_days * interval '1 day' > now()))`,
  );
}

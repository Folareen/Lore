import { eq, sql } from 'drizzle-orm';
import { expireCandidates } from '../ai/candidate-retention';
import { channels } from '../database/schema';
import type { InfrastructureService } from '../infrastructure.service';
type Tx = Parameters<
  Parameters<InfrastructureService['db']['transaction']>[0]
>[0];
// Caller holds the channel row lock, shared with ingestion, confirmations and settings.
export async function purgeChannel(tx: Tx, channelId: string) {
  // Deadlines only move earlier. Raising a setting must never resurrect old data.
  await tx.execute(
    sql`UPDATE source_events e SET expires_at=LEAST(e.expires_at,e.occurred_at+c.chat_retention_days*interval '1 day') FROM channels c WHERE e.channel_id=c.id AND c.id=${channelId} AND e.type='channel.chat.message' AND e.expires_at>e.occurred_at+c.chat_retention_days*interval '1 day'`,
  );
  await tx.execute(
    sql`UPDATE chat_messages m SET expires_at=LEAST(m.expires_at,m.occurred_at+c.chat_retention_days*interval '1 day') FROM channels c WHERE m.channel_id=c.id AND c.id=${channelId} AND m.expires_at>m.occurred_at+c.chat_retention_days*interval '1 day'`,
  );
  await tx.execute(
    sql`UPDATE source_events SET payload=NULL WHERE channel_id=${channelId} AND payload IS NOT NULL AND expires_at<=now()`,
  );
  await tx.execute(
    sql`DELETE FROM chat_messages WHERE channel_id=${channelId} AND expires_at<=now()`,
  );
  await tx.execute(
    sql`UPDATE ai_candidates a SET expires_at=LEAST(a.expires_at,s.expires_at) FROM source_events s WHERE a.channel_id=${channelId} AND s.channel_id=a.channel_id AND s.id=a.source_event_id AND a.expires_at>s.expires_at`,
  );
  await expireCandidates(tx, channelId);
  await tx.execute(
    sql`UPDATE microphone_captures m SET expires_at=LEAST(m.expires_at,m.created_at+c.chat_retention_days*interval '1 day') FROM channels c WHERE m.channel_id=c.id AND c.id=${channelId} AND m.expires_at>m.created_at+c.chat_retention_days*interval '1 day'`,
  );
  await tx.execute(
    sql`UPDATE microphone_captures m SET transcript=NULL,drafts=NULL FROM channels c WHERE m.channel_id=c.id AND c.id=${channelId} AND m.transcript IS NOT NULL AND (m.expires_at<=now() OR NOT c.microphone_enabled OR c.disconnected_at IS NOT NULL)`,
  );
  await tx.execute(
    sql`UPDATE source_events s SET payload=NULL WHERE s.channel_id=${channelId} AND s.type='microphone.transcript' AND s.payload IS NOT NULL AND NOT EXISTS (SELECT 1 FROM microphone_captures m WHERE m.channel_id=s.channel_id AND m.source_event_id=s.id AND m.transcript IS NOT NULL)`,
  );
  // Durable confirmed evidence has no FK to ordinary delivery receipts and survives this pruning.
  await tx.execute(
    sql`DELETE FROM source_events WHERE channel_id=${channelId} AND created_at<now()-interval '30 days' AND payload IS NULL`,
  );
  await tx
    .update(channels)
    .set({ lastRetentionPurgeAt: new Date() })
    .where(eq(channels.id, channelId));
}
export async function retentionSnapshot(
  tx: Tx,
  channel: typeof channels.$inferSelect,
) {
  const counts = await tx.execute<{ captured: number; expired: number }>(
    sql`SELECT count(*)::int AS captured, count(*) FILTER(WHERE expires_at<=now() OR occurred_at+${channel.chatRetentionDays}*interval '1 day'<=now())::int AS expired FROM chat_messages WHERE channel_id=${channel.id}`,
  );
  return {
    retentionDays: channel.chatRetentionDays,
    capturedMessages: counts.rows[0].captured,
    expiredMessages: counts.rows[0].expired,
    lastPurgedAt: channel.lastRetentionPurgeAt,
    intervalSeconds: 60,
  };
}

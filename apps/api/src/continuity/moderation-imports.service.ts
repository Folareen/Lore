import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  caseImports,
  caseEvidence,
  caseHistory,
  cases,
  channels,
  evidence,
  sourceEvents,
} from '../database/schema';
import type { CaseTx } from '../cases/cases.repository';
import { fingerprint } from '../cases/cases.repository';
import { eventSchemas } from '../ingestion/eventsub.schemas';

@Injectable()
export class ModerationImportsService {
  async ingest(
    tx: CaseTx,
    channel: typeof channels.$inferSelect,
    event: typeof sourceEvents.$inferSelect,
  ) {
    if (!channel.moderationImportsEnabled || !channel.twitchChannelId) return;
    let externalKey: string,
      subject: string,
      title: string,
      incident: string,
      appeal = '';
    let relatedKeys: string[] = [];
    if (event.type === 'channel.ban') {
      const p = eventSchemas['channel.ban'].parse(event.payload);
      externalKey = `ban:${p.user_id}:${p.banned_at}`;
      subject = `${p.user_login} (Twitch ${p.user_id})`;
      title = `${p.is_permanent ? 'Ban' : 'Timeout'} review: ${p.user_login}`;
      incident = `Twitch reported a ${p.is_permanent ? 'ban' : 'timeout'} at ${p.banned_at}. Reported reason: ${p.reason || 'No reason supplied.'} This event does not establish wrongdoing.`;
    } else if (event.type === 'channel.unban_request.create') {
      const p = eventSchemas['channel.unban_request.create'].parse(
        event.payload,
      );
      externalKey = `${event.type}:${p.id}`;
      relatedKeys = [`channel.unban_request.resolve:${p.id}`];
      subject = `${p.user_login} (Twitch ${p.user_id})`;
      title = `Unban request: ${p.user_login}`;
      incident =
        'Imported Twitch unban request. The original ban context and applicable channel rule must be reviewed by a moderator.';
      appeal = p.text;
    } else if (event.type === 'channel.unban_request.resolve') {
      const p = eventSchemas['channel.unban_request.resolve'].parse(
        event.payload,
      );
      externalKey = `${event.type}:${p.id}`;
      relatedKeys = [`channel.unban_request.create:${p.id}`];
      subject = `${p.user_login} (Twitch ${p.user_id})`;
      title = `Resolved Twitch unban request: ${p.user_login}`;
      incident = `Twitch reported the request as ${p.status} at ${event.occurredAt.toISOString()}. This is an external event, not a Lore human decision. ${p.resolution_text}`;
    } else return;
    const [duplicate] = await tx
      .select()
      .from(caseImports)
      .where(
        and(
          eq(caseImports.channelId, channel.id),
          eq(caseImports.externalKey, externalKey),
        ),
      );
    if (duplicate) return;
    const [related] = relatedKeys.length
      ? await tx
          .select()
          .from(caseImports)
          .where(
            and(
              eq(caseImports.channelId, channel.id),
              inArray(caseImports.externalKey, relatedKeys),
            ),
          )
      : [];
    let record: typeof cases.$inferSelect;
    if (related) {
      [record] = await tx
        .select()
        .from(cases)
        .where(
          and(eq(cases.channelId, channel.id), eq(cases.id, related.caseId)),
        )
        .for('update');
    } else {
      [record] = await tx
        .insert(cases)
        .values({
          channelId: channel.id,
          requestId: randomUUID(),
          requestFingerprint: fingerprint({ externalKey }),
          createdByTwitchUserId: channel.twitchChannelId,
          title: title.slice(0, 200),
          subjectReference: subject.slice(0, 150),
          incident: incident.slice(0, 4000),
          appeal,
          incidentAt: event.occurredAt,
          ruleTitle: 'Rule not supplied by Twitch — human review required',
          ruleVersion: 'unknown',
          ruleText:
            'No channel rule snapshot was supplied with this event. Record the applicable rule and version before deciding.',
          origin: 'live_twitch',
        })
        .returning();
      await tx.insert(caseHistory).values({
        channelId: channel.id,
        caseId: record.id,
        version: 1,
        action: 'created',
        actorTwitchUserId: channel.twitchChannelId,
        reason:
          'Automatically imported under owner consent; not a moderation decision.',
      });
    }
    await tx.insert(caseImports).values({
      channelId: channel.id,
      sourceEventId: event.id,
      externalKey,
      caseId: record.id,
    });
    const excerpt = JSON.stringify(event.payload);
    const [proof] = await tx
      .insert(evidence)
      .values({
        channelId: channel.id,
        sourceEventId: event.id,
        excerpt,
        origin: 'live_twitch',
        visibility: 'private_moderation',
      })
      .returning();
    await tx.insert(caseEvidence).values({
      channelId: channel.id,
      caseId: record.id,
      evidenceId: proof.id,
      requestId: randomUUID(),
      inputFingerprint: fingerprint({ externalKey }),
      label: `${event.type} · verified Twitch event`,
      occurredAt: event.occurredAt,
    });
    await tx
      .update(cases)
      .set({
        version: record.version + 1,
        updatedAt: new Date(),
        embedding: null,
        embeddingVersion: null,
        embeddingModel: null,
      })
      .where(eq(cases.id, record.id));
    await tx.insert(caseHistory).values({
      channelId: channel.id,
      caseId: record.id,
      version: record.version + 1,
      action: 'evidence_added',
      actorTwitchUserId: channel.twitchChannelId,
      reason: `Retained ${event.type}; external events never decide a Lore case.`,
    });
  }
}

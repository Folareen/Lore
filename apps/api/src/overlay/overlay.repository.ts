import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  type OverlaySettings,
  type OverlayDisplay,
  type updateOverlaySchema,
} from '@lore/shared';
import { InfrastructureService } from '../infrastructure.service';
import { PublicationsRepository } from '../publications/publications.repository';
import {
  channels,
  overlayTokens,
  publicEntries,
  auditEvents,
} from '../database/schema';
import { equalToken, hashToken, randomToken } from '../auth/auth-crypto';
import type { CaseActor, CaseTx } from '../cases/cases.repository';
type Row = typeof overlayTokens.$inferSelect;
@Injectable()
export class OverlayRepository {
  constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(PublicationsRepository)
    private readonly publications: PublicationsRepository,
  ) {}
  private project(row?: Row): OverlaySettings {
    return {
      version: row?.version ?? 0,
      enabled: row?.enabled ?? false,
      mode: row?.mode ?? 'recap',
      entryIds: row?.entryIds ?? [],
      tokenActive: Boolean(row?.tokenHash),
    };
  }
  private async current(tx: CaseTx, channelId: string) {
    return (
      await tx
        .select()
        .from(overlayTokens)
        .where(eq(overlayTokens.channelId, channelId))
    )[0];
  }
  async settings(channelId: string, actor: CaseActor) {
    return this.infrastructure.db.transaction(async (tx) => {
      const { role } = await this.publications.authorize(
        tx,
        channelId,
        actor.id,
      );
      if (role === 'team')
        throw new NotFoundException('Owner or moderator access required');
      return this.project(await this.current(tx, channelId));
    });
  }
  async update(
    channelId: string,
    actor: CaseActor,
    input: z.infer<typeof updateOverlaySchema>,
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      const { role } = await this.publications.authorize(
        tx,
        channelId,
        actor.id,
        true,
      );
      if (role === 'team')
        throw new NotFoundException('Owner or moderator access required');
      const row = await this.current(tx, channelId);
      if ((row?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException('Overlay changed. Reload before saving.');
      if (input.entryIds.length) {
        const sources = await tx
          .select({ id: publicEntries.id })
          .from(publicEntries)
          .where(
            and(
              eq(publicEntries.channelId, channelId),
              eq(publicEntries.status, 'published'),
              eq(
                publicEntries.kind,
                input.mode === 'recap' ? 'summary' : 'commitment',
              ),
              inArray(publicEntries.id, input.entryIds),
            ),
          );
        if (sources.length !== input.entryIds.length)
          throw new ConflictException(
            'Choose currently published entries of the selected kind.',
          );
      }
      const value = {
        enabled: input.enabled,
        mode: input.mode,
        entryIds: input.entryIds,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
      };
      const [updated] = await tx
        .insert(overlayTokens)
        .values({ channelId, ...value })
        .onConflictDoUpdate({ target: overlayTokens.channelId, set: value })
        .returning();
      await tx.insert(auditEvents).values({
        channelId,
        actorId: actor.id,
        targetId: channelId,
        action: 'overlay.content_approved',
        details: {
          overlay: {
            entryIds: input.entryIds,
            enabled: input.enabled,
            mode: input.mode,
          },
        },
      });
      return this.project(updated);
    });
  }
  async token(
    channelId: string,
    actor: CaseActor,
    expectedVersion: number,
    rotate: boolean,
  ) {
    return this.infrastructure.db.transaction(async (tx) => {
      const { role } = await this.publications.authorize(
        tx,
        channelId,
        actor.id,
        rotate,
      );
      if (role !== 'owner')
        throw new NotFoundException('Owner access required');
      const row = await this.current(tx, channelId);
      if ((row?.version ?? 0) !== expectedVersion)
        throw new ConflictException(
          'Overlay changed. Reload before updating its link.',
        );
      const token = rotate ? randomToken() : null;
      const value = {
        tokenHash: token ? hashToken(token) : null,
        version: expectedVersion + 1,
        updatedAt: new Date(),
        revokedAt: token ? null : new Date(),
        ...(!rotate ? { enabled: false } : {}),
      };
      const [updated] = await tx
        .insert(overlayTokens)
        .values({ channelId, ...value })
        .onConflictDoUpdate({ target: overlayTokens.channelId, set: value })
        .returning();
      await tx.insert(auditEvents).values({
        channelId,
        actorId: actor.id,
        targetId: channelId,
        action: rotate ? 'overlay.token_rotated' : 'overlay.token_revoked',
      });
      return { token, settings: this.project(updated) };
    });
  }
  async display(slug: string, token: string): Promise<OverlayDisplay> {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new NotFoundException('Overlay unavailable');
    return this.infrastructure.db.transaction(async (tx) => {
      const [channel] = await tx
        .select()
        .from(channels)
        .where(and(eq(channels.slug, slug), eq(channels.origin, 'live_twitch')))
        .for('share');
      if (!channel) throw new NotFoundException('Overlay unavailable');
      const row = await this.current(tx, channel.id);
      if (
        !channel.connectedAt ||
        channel.disconnectedAt ||
        !row?.tokenHash ||
        !equalToken(hashToken(token), row.tokenHash)
      )
        throw new NotFoundException('Overlay unavailable');
      const entries =
        row.enabled && row.entryIds.length
          ? await tx
              .select({
                id: publicEntries.id,
                title: publicEntries.title,
                chatSummary: publicEntries.chatSummary,
              })
              .from(publicEntries)
              .where(
                and(
                  eq(publicEntries.channelId, channel.id),
                  eq(publicEntries.status, 'published'),
                  eq(
                    publicEntries.kind,
                    row.mode === 'recap' ? 'summary' : 'commitment',
                  ),
                  inArray(publicEntries.id, row.entryIds),
                ),
              )
          : [];
      return {
        channel: channel.displayName,
        mode: row.mode,
        items: row.entryIds.flatMap((id) => {
          const entry = entries.find((e) => e.id === id);
          return entry
            ? [
                {
                  id: entry.id,
                  title: entry.title,
                  text: row.mode === 'recap' ? entry.chatSummary : '',
                },
              ]
            : [];
        }),
      };
    });
  }
}

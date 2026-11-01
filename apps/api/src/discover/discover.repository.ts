import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  discoverPageSchema,
  publicationKindSchema,
  type discoverQuerySchema,
} from '@lore/shared';
import { InfrastructureService } from '../infrastructure.service';
const cursorSchema = z.strictObject({
  name: z.string().max(1000),
  slug: z.string().max(200),
});
const rowSchema = z.strictObject({
  slug: z.string(),
  displayName: z.string(),
  sortName: z.string(),
  storyCount: z.number().int().positive(),
  id: z.uuid(),
  title: z.string(),
  excerpt: z.string(),
  kind: publicationKindSchema,
  publishedAt: z.iso.datetime(),
});
@Injectable()
export class DiscoverRepository {
  constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
  ) {}
  async list(query: z.infer<typeof discoverQuerySchema>) {
    let cursor: z.infer<typeof cursorSchema> | undefined;
    if (query.cursor) {
      try {
        if (!/^[A-Za-z0-9_-]+$/.test(query.cursor))
          throw new Error('Invalid cursor');
        cursor = cursorSchema.parse(
          JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')),
        );
      } catch {
        throw new BadRequestException(
          'Invalid discovery cursor. Start a new search.',
        );
      }
    }
    const pattern = `%${query.q.replace(/^@/, '').replace(/[\\%_]/g, '\\$&')}%`;
    // Every result, preview and count comes from the same public scope. No team tables are joined.
    const result = await this.infrastructure.db.execute(sql`
      SELECT c.slug, c.display_name AS "displayName", lower(c.display_name) AS "sortName",
        latest.id, latest.title, left(latest.body, 240) AS excerpt, latest.kind,
        to_char(latest.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "publishedAt",
        (SELECT count(*)::int FROM public_entries p WHERE p.channel_id=c.id AND p.status='published') AS "storyCount"
      FROM channels c
      JOIN LATERAL (
        SELECT e.id, e.title, e.body, e.kind, e.published_at
        FROM public_entries e WHERE e.channel_id=c.id AND e.status='published'
        ORDER BY e.published_at DESC, e.id DESC LIMIT 1
      ) latest ON true
      WHERE c.connected_at IS NOT NULL AND c.disconnected_at IS NULL AND c.origin <> 'demo_fixture'
        ${query.q ? sql`AND (c.display_name ILIKE ${pattern} OR c.slug ILIKE ${pattern})` : sql``}
        ${cursor ? sql`AND (lower(c.display_name) COLLATE "C", c.slug COLLATE "C") > (${cursor.name}, ${cursor.slug})` : sql``}
      ORDER BY lower(c.display_name) COLLATE "C", c.slug COLLATE "C"
      LIMIT 13
    `);
    const rows = z.array(rowSchema).parse(result.rows);
    const page = rows.slice(0, 12);
    const last = page.at(-1);
    return discoverPageSchema.parse({
      items: page.map((row) => ({
        slug: row.slug,
        displayName: row.displayName,
        storyCount: row.storyCount,
        latest: {
          id: row.id,
          title: row.title,
          excerpt: row.excerpt,
          kind: row.kind,
          publishedAt: row.publishedAt,
        },
      })),
      nextCursor:
        rows.length > 12 && last
          ? Buffer.from(
              JSON.stringify({ name: last.sortName, slug: last.slug }),
            ).toString('base64url')
          : null,
    });
  }
}

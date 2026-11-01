import { z } from 'zod';

const storageKey = 'lore:pending-moderator';
const pendingSchema = z.strictObject({
  actorId: z.uuid(),
  channelId: z.uuid(),
  action: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('grant'),
      twitchUserId: z.string().regex(/^\d+$/),
      role: z.enum(['moderator', 'team']),
    }),
    z.strictObject({ kind: z.literal('remove'), userId: z.uuid() }),
  ]),
  createdAt: z.number(),
});
export type PendingModerator = z.infer<typeof pendingSchema>;

export function savePendingModerator(
  input: Omit<PendingModerator, 'createdAt'>,
) {
  sessionStorage.setItem(
    storageKey,
    JSON.stringify({ ...input, createdAt: Date.now() }),
  );
}

export function takePendingModerator(actorId: string) {
  const raw = sessionStorage.getItem(storageKey);
  sessionStorage.removeItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = pendingSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.actorId !== actorId) return null;
    const age = Date.now() - parsed.data.createdAt;
    return age >= 0 && age < 10 * 60_000 ? parsed.data : null;
  } catch {
    return null;
  }
}

import { z } from 'zod';
import { channelResponseSchema, sessionResponseSchema } from '@lore/shared';
import { serverApi } from '../../lib/server-api';
import { AppShell } from '../../features/workspace/app-shell';
export const metadata = {
  title: 'Your workspace',
  robots: { index: false, follow: false },
};
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await serverApi('/auth/session', sessionResponseSchema);
  const channels = await serverApi('/channels', z.array(channelResponseSchema));
  return (
    <AppShell session={session} channels={channels}>
      {children}
    </AppShell>
  );
}

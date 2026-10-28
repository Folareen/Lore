import { AppShell } from '../../features/workspace/app-shell';
import { previewChannels, previewSession } from '../../lib/preview-data';
// Keep fixture state across preview navigation; a full refresh creates a fresh demo.
export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell session={previewSession} channels={previewChannels} preview>
      {children}
    </AppShell>
  );
}

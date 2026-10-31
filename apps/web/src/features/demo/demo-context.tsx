'use client';
import { useState } from 'react';
import type { DemoDataset } from '@lore/shared';
import { AppShell } from '../workspace/app-shell';
import { DemoSeedContext } from './demo-seed-context';
export function DemoPlayground({
  data,
  children,
}: {
  data: DemoDataset;
  children: React.ReactNode;
}) {
  const [revision, setRevision] = useState(0);
  return (
    <DemoSeedContext.Provider
      value={{ data, reset: () => setRevision((v) => v + 1) }}
    >
      <AppShell
        key={revision}
        session={data.session}
        channels={data.channels}
        preview
        fixtureBase="/demo"
      >
        {children}
      </AppShell>
    </DemoSeedContext.Provider>
  );
}

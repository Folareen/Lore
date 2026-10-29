'use client';
import { createContext, useContext } from 'react';
import type { DemoDataset } from '@lore/shared';
export const DemoSeedContext = createContext<{
  data: DemoDataset;
  reset: () => void;
} | null>(null);
export function useDemo() {
  return useContext(DemoSeedContext);
}

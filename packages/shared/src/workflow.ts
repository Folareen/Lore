import { z } from 'zod';
export const openLoopStatusSchema = z.enum([
  'candidate',
  'confirmed',
  'in_progress',
  'fulfilled',
  'postponed',
  'cancelled',
]);
export type OpenLoopStatus = z.infer<typeof openLoopStatusSchema>;
// Initial workflow policy; changing it is a product decision shared by API and UI.
export const openLoopTransitions: Record<
  OpenLoopStatus,
  readonly OpenLoopStatus[]
> = {
  candidate: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'fulfilled', 'postponed', 'cancelled'],
  in_progress: ['fulfilled', 'postponed', 'cancelled'],
  postponed: ['confirmed', 'in_progress', 'cancelled'],
  fulfilled: [],
  cancelled: [],
};
export function canTransitionOpenLoop(
  from: OpenLoopStatus,
  to: OpenLoopStatus,
): boolean {
  return openLoopTransitions[from].includes(to);
}
export const recordOriginSchema = z.enum([
  'live_twitch',
  'manual_import',
  'demo_fixture',
]);

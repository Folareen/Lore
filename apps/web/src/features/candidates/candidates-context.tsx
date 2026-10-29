'use client';
import { useDemo } from '../demo/demo-seed-context';
import { createContext, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  aiStatusSchema,
  candidatePageSchema,
  type AiStatus,
  type Candidate,
  type ReviewCandidate,
} from '@lore/shared';
import { apiRequest, ApiError } from '../../lib/api';
import { previewCandidates } from '../../lib/preview-candidates';
import { useWorkspace } from '../workspace/workspace-context';
type Status = Candidate['status'];
type Review = {
  load: (
    channelId: string,
    status: Status,
    signal?: AbortSignal,
    cursor?: string,
  ) => Promise<z.infer<typeof candidatePageSchema>>;
  status: (channelId: string, signal?: AbortSignal) => Promise<AiStatus>;
  enable: (channelId: string, enabled: boolean) => Promise<void>;
  analyze: (channelId: string, runId?: string) => Promise<void>;
  confirm: (candidate: Candidate, input: ReviewCandidate) => Promise<string>;
  dismiss: (candidate: Candidate, reason: string) => Promise<void>;
};
const Context = createContext<Review | null>(null);
export function CandidatesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { preview, session, selected, recordPreviewReview } = useWorkspace();
  const router = useRouter();
  const [fixtures, setFixtures] = useState<Candidate[]>(
    useDemo()?.data.candidates ?? previewCandidates,
  );
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    method = 'GET',
    body?: unknown,
    signal?: AbortSignal,
  ) {
    try {
      return await apiRequest(path, schema, {
        method,
        body,
        signal,
        csrfToken: method === 'GET' ? undefined : session.csrfToken,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        router.replace('/login?expired=1');
      throw error;
    }
  }
  function checkDemo(candidate: Candidate) {
    const current = fixtures.find(
      (item) => item.id === candidate.id && item.channelId === selected?.id,
    );
    if (
      !selected?.connected ||
      !current ||
      current.status !== 'pending' ||
      current.version !== candidate.version ||
      !current.source.available ||
      !current.draft
    )
      throw new Error('This candidate changed. Refresh before reviewing.');
    return current;
  }
  return (
    <Context.Provider
      value={{
        load: async (id, status, signal, cursor) =>
          preview
            ? {
                items: fixtures.filter(
                  (item) => item.channelId === id && item.status === status,
                ),
                nextCursor: null,
              }
            : request(
                `/channels/${id}/candidates?status=${status}${cursor ? `&cursor=${cursor}` : ''}`,
                candidatePageSchema,
                'GET',
                undefined,
                signal,
              ),
        status: async (id, signal) =>
          preview
            ? {
                configured: true,
                enabled: true,
                provider: 'gemini',
                model: 'Demo fixture · no provider calls',
                dailyUsed: 0,
                dailyLimit: 50,
                recentRuns: [],
              }
            : request(
                `/channels/${id}/ai`,
                aiStatusSchema,
                'GET',
                undefined,
                signal,
              ),
        enable: async (id, enabled) => {
          if (preview) return;
          await request(`/channels/${id}/ai/settings`, aiStatusSchema, 'POST', {
            enabled,
          });
        },
        analyze: async (id, runId) => {
          if (preview) return;
          await request(
            `/channels/${id}/ai/extractions${runId ? `/${runId}/retry` : ''}`,
            z.strictObject({ runId: z.uuid() }),
            'POST',
            {},
          );
        },
        confirm: async (candidate, input) => {
          if (!preview) {
            const result = await request(
              `/channels/${candidate.channelId}/candidates/${candidate.id}/confirm`,
              z.strictObject({ openLoopId: z.uuid() }),
              'POST',
              input,
            );
            return result.openLoopId;
          }
          const current = checkDemo(candidate);
          const now = new Date().toISOString();
          const id = input.requestId;
          recordPreviewReview({
            id,
            channelId: candidate.channelId,
            wording: input.wording,
            ownerLabel: input.ownerLabel || null,
            dueContext: input.dueContext || null,
            status: 'confirmed',
            version: 1,
            origin: 'demo_fixture',
            captureMethod: 'ai_review',
            createdAt: now,
            updatedAt: now,
            source: { excerpt: current.source.text!, originalAvailable: true },
          });
          setFixtures((rows) =>
            rows.map((item) =>
              item.id === candidate.id
                ? {
                    ...item,
                    status: 'confirmed',
                    version: item.version + 1,
                    confirmedOpenLoopId: id,
                    reviewedByTwitchUserId: session.user.twitchUserId,
                    reviewedAt: now,
                  }
                : item,
            ),
          );
          return id;
        },
        dismiss: async (candidate, reason) => {
          if (!preview) {
            await request(
              `/channels/${candidate.channelId}/candidates/${candidate.id}/dismiss`,
              z.undefined(),
              'POST',
              { expectedVersion: candidate.version, reason },
            );
            return;
          }
          checkDemo(candidate);
          setFixtures((rows) =>
            rows.map((item) =>
              item.id === candidate.id
                ? {
                    ...item,
                    status: 'dismissed',
                    version: item.version + 1,
                    reviewedByTwitchUserId: session.user.twitchUserId,
                    reviewedAt: new Date().toISOString(),
                    reviewReason: reason,
                  }
                : item,
            ),
          );
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCandidates() {
  const context = useContext(Context);
  if (!context) throw new Error('CandidatesProvider is required');
  return context;
}

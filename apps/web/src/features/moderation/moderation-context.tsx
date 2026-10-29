'use client';
import { useDemo } from '../demo/demo-seed-context';
import { createContext, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  moderationDeskSchema,
  repairActionSchema,
  consistencyFlagSchema,
  handoffItemSchema,
  repairTransitions,
  handoffTaskTransitions,
  consistencyTransitions,
  ruleChangeSchema,
  type recordRuleChangeSchema,
  type ModerationDesk,
  type createRepairSchema,
  type updateRepairSchema,
  type createFlagSchema,
  type reviewFlagSchema,
  type updateHandoffTaskSchema,
  type Handoff,
} from '@lore/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { previewPeople } from '../../lib/preview-data';
import { useWorkspace } from '../workspace/workspace-context';
import { useCases } from '../cases/cases-context';
type DeskQuery = {
  caseId?: string;
  repairCursor?: string;
  flagCursor?: string;
  handoffCursor?: string;
  ruleCursor?: string;
  activityCursor?: string;
};
type ModerationWorkspace = {
  ruleChange: (
    channelId: string,
    input: z.infer<typeof recordRuleChangeSchema>,
  ) => Promise<void>;
  desk: (
    channelId: string,
    query?: DeskQuery,
    signal?: AbortSignal,
  ) => Promise<ModerationDesk>;
  createRepair: (
    channelId: string,
    input: z.infer<typeof createRepairSchema>,
  ) => Promise<void>;
  updateRepair: (
    channelId: string,
    id: string,
    input: z.infer<typeof updateRepairSchema>,
  ) => Promise<void>;
  createFlag: (
    channelId: string,
    input: z.infer<typeof createFlagSchema>,
  ) => Promise<void>;
  review: (
    channelId: string,
    id: string,
    input: z.infer<typeof reviewFlagSchema>,
  ) => Promise<void>;
  scan: (channelId: string) => Promise<{ created: number; hasMore: boolean }>;
  generate: (channelId: string, requestId: string) => Promise<void>;
  task: (
    channelId: string,
    handoffId: string,
    id: string,
    input: z.infer<typeof updateHandoffTaskSchema>,
  ) => Promise<void>;
};
const Context = createContext<ModerationWorkspace | null>(null);
export function ModerationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, channels, preview } = useWorkspace();
  const demo = useDemo()?.data;
  const people = demo?.people ?? previewPeople;
  const cases = useCases();
  const router = useRouter();
  const [state, setState] = useState<
    Pick<
      ModerationDesk,
      'repairs' | 'flags' | 'handoffs' | 'activity' | 'ruleChanges'
    >
  >(
    demo?.moderation ?? {
      repairs: [],
      flags: [],
      handoffs: [],
      activity: [],
      ruleChanges: [],
    },
  );
  const [requests, setRequests] = useState<Record<string, string>>({});
  const now = () => new Date().toISOString();
  function access(id: string, mutation = false) {
    const channel = channels.find((c) => c.id === id);
    if (
      !channel ||
      !['owner', 'moderator'].includes(channel.role) ||
      (channel.role !== 'owner' && !channel.connected)
    )
      throw new Error('Moderation access required.');
    if (mutation && !channel.connected)
      throw new Error('Reconnect the channel first.');
  }
  function assignee(id: string | null) {
    if (
      id &&
      id !== session.user.id &&
      !people.some((p) => p.userId === id && p.role === 'moderator')
    )
      throw new Error('Choose an approved moderator.');
  }
  function log(
    channelId: string,
    targetType: ModerationDesk['activity'][number]['targetType'],
    targetId: string,
    caseId: string | null,
    action: string,
    note: string | null,
    assigneeId: string | null = null,
  ) {
    void channelId;
    setState((s) => ({
      ...s,
      activity: [
        {
          id: crypto.randomUUID(),
          targetType,
          targetId,
          caseId,
          action,
          note,
          assigneeId,
          actorTwitchUserId: session.user.twitchUserId,
          occurredAt: now(),
        },
        ...s.activity,
      ],
    }));
  }
  async function request<T>(
    channelId: string,
    path: string,
    schema: z.ZodType<T>,
    method = 'GET',
    body?: unknown,
    signal?: AbortSignal,
  ) {
    try {
      return await apiRequest(`/channels/${channelId}${path}`, schema, {
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
  function duplicate(channelId: string, requestId: string, input: unknown) {
    const key = `${channelId}-${requestId}`,
      hash = JSON.stringify(input);
    if (requests[key] && requests[key] !== hash)
      throw new Error('Request ID already used.');
    if (requests[key]) return true;
    setRequests((r) => ({ ...r, [key]: hash }));
    return false;
  }
  return (
    <Context.Provider
      value={{
        desk: async (id, query = {}, signal) => {
          if (!preview)
            return request(
              id,
              `/moderation?${new URLSearchParams(query)}`,
              moderationDeskSchema,
              'GET',
              undefined,
              signal,
            );
          access(id);
          const owned = new Set(
            (await cases.list(id, {})).items.map((c) => c.id),
          );
          return {
            assignees: [
              {
                id: session.user.id,
                displayName: session.user.displayName,
                twitchUserId: session.user.twitchUserId,
              },
              ...people
                .filter((p) => p.role === 'moderator')
                .map((p) => ({
                  id: p.userId,
                  displayName: p.displayName,
                  twitchUserId: p.twitchUserId,
                })),
            ],
            repairs: state.repairs.filter(
              (r) =>
                r.channelId === id &&
                (!query.caseId || r.caseId === query.caseId),
            ),
            flags: state.flags.filter(
              (f) =>
                f.channelId === id &&
                (!query.caseId ||
                  f.caseId === query.caseId ||
                  f.comparedCaseId === query.caseId),
            ),
            handoffs: state.handoffs.filter((h) => h.channelId === id),
            activity: state.activity.filter((a) =>
              a.caseId
                ? owned.has(a.caseId) &&
                  (!query.caseId || a.caseId === query.caseId)
                : !query.caseId &&
                  (state.ruleChanges.some(
                    (r) => r.channelId === id && r.id === a.targetId,
                  ) ||
                    state.handoffs.some(
                      (h) => h.channelId === id && h.id === a.targetId,
                    )),
            ),
            activityTruncated: false,
            nextCursors: {
              repairs: null,
              flags: null,
              handoffs: null,
              ruleChanges: null,
              activity: null,
            },
            ruleChanges: state.ruleChanges.filter((r) => r.channelId === id),
            ruleChangesTruncated: false,
          };
        },
        createRepair: async (id, input) => {
          if (!preview) {
            await request(id, '/repairs', repairActionSchema, 'POST', input);
            return;
          }
          access(id, true);
          assignee(input.assigneeId);
          const record = await cases.get(id, input.caseId);
          if (record.status !== 'decided')
            throw new Error('Record a human decision first.');
          if (duplicate(id, input.requestId, input)) return;
          const { requestId, ...data } = input;
          void requestId;
          const row = {
            ...data,
            id: crypto.randomUUID(),
            channelId: id,
            status: 'pending' as const,
            version: 1,
            completionNote: null,
            evidenceId: null,
            createdAt: now(),
            updatedAt: now(),
          };
          setState((s) => ({ ...s, repairs: [row, ...s.repairs] }));
          log(
            id,
            'repair',
            row.id,
            row.caseId,
            'repair_created',
            input.agreement,
            input.assigneeId,
          );
        },
        updateRepair: async (id, repairId, input) => {
          if (!preview) {
            await request(
              id,
              `/repairs/${repairId}`,
              repairActionSchema,
              'PATCH',
              input,
            );
            return;
          }
          access(id, true);
          assignee(input.assigneeId);
          const row = state.repairs.find(
            (r) => r.channelId === id && r.id === repairId,
          );
          if (
            !row ||
            row.version !== input.expectedVersion ||
            ['completed', 'cancelled'].includes(row.status)
          )
            throw new Error(
              'Action changed or is final. Refresh before trying again.',
            );
          if (
            row.status !== input.status &&
            !repairTransitions[row.status].includes(input.status)
          )
            throw new Error('Invalid transition.');
          if (input.evidenceId) {
            const record = await cases.get(id, row.caseId);
            if (
              !record.evidence.some(
                (e) => e.id === input.evidenceId && !e.removed,
              ) ||
              input.status !== 'completed'
            )
              throw new Error('Available case evidence is required.');
          }
          setState((s) => ({
            ...s,
            repairs: s.repairs.map((r) =>
              r.id === repairId
                ? {
                    ...r,
                    status: input.status,
                    assigneeId: input.assigneeId,
                    evidenceId: input.evidenceId,
                    completionNote: ['completed', 'cancelled'].includes(
                      input.status,
                    )
                      ? input.note
                      : null,
                    version: r.version + 1,
                    updatedAt: now(),
                  }
                : r,
            ),
          }));
          log(
            id,
            'repair',
            row.id,
            row.caseId,
            `repair_${input.status}`,
            input.note,
            input.assigneeId,
          );
        },
        createFlag: async (id, input) => {
          if (!preview) {
            await request(
              id,
              '/consistency',
              consistencyFlagSchema,
              'POST',
              input,
            );
            return;
          }
          access(id, true);
          const record = await cases.get(id, input.caseId);
          const other = input.comparedCaseId
            ? await cases.get(id, input.comparedCaseId)
            : null;
          if (other?.id === record.id)
            throw new Error('Compare two different cases.');
          if (duplicate(id, input.requestId, input)) return;
          const row = {
            id: crypto.randomUUID(),
            channelId: id,
            caseId: record.id,
            comparedCaseId: other?.id ?? null,
            caseVersion: record.version,
            comparedVersion: other?.version ?? null,
            version: 1,
            status: 'open' as const,
            origin: 'human' as const,
            concern: input.concern,
            reviewNote: null,
            severityContext: '',
            evidenceContext: '',
            reviewedByTwitchUserId: null,
            reviewedAt: null,
            createdAt: now(),
            updatedAt: now(),
          };
          setState((s) => ({ ...s, flags: [row, ...s.flags] }));
          log(id, 'flag', row.id, row.caseId, 'flag_created', row.concern);
        },
        review: async (id, flagId, input) => {
          if (!preview) {
            await request(
              id,
              `/consistency/${flagId}`,
              consistencyFlagSchema,
              'PATCH',
              input,
            );
            return;
          }
          access(id, true);
          const row = state.flags.find(
            (f) => f.channelId === id && f.id === flagId,
          );
          if (
            !row ||
            row.version !== input.expectedVersion ||
            !consistencyTransitions[row.status].includes(input.status)
          )
            throw new Error(
              'Review changed or is final. Refresh before trying again.',
            );
          setState((s) => ({
            ...s,
            flags: s.flags.map((f) =>
              f.id === flagId
                ? {
                    ...f,
                    status: input.status,
                    reviewNote: input.note,
                    severityContext: input.severityContext,
                    evidenceContext: input.evidenceContext,
                    reviewedByTwitchUserId: session.user.twitchUserId,
                    reviewedAt: now(),
                    version: f.version + 1,
                    updatedAt: now(),
                  }
                : f,
            ),
          }));
          log(
            id,
            'flag',
            row.id,
            row.caseId,
            `flag_${input.status === 'open' ? 'annotated' : input.status}`,
            `${input.note}\nSeverity/context: ${input.severityContext}\nEvidence: ${input.evidenceContext}`,
          );
        },
        ruleChange: async (id, input) => {
          if (!preview) {
            await request(
              id,
              '/moderation/rule-changes',
              ruleChangeSchema,
              'POST',
              input,
            );
            return;
          }
          access(id, true);
          if (input.previousVersion === input.version)
            throw new Error('Use a different rule version.');
          if (duplicate(id, input.requestId, input)) return;
          const { requestId, ...fields } = input;
          void requestId;
          const row = {
            ...fields,
            id: crypto.randomUUID(),
            channelId: id,
            actorTwitchUserId: session.user.twitchUserId,
            createdAt: now(),
          };
          setState((s) => ({ ...s, ruleChanges: [row, ...s.ruleChanges] }));
          log(
            id,
            'rule',
            row.id,
            null,
            'rule_change_recorded',
            input.changeSummary,
          );
        },
        scan: async (id) => {
          if (!preview)
            return request(
              id,
              '/consistency/scan',
              z.strictObject({ created: z.number(), hasMore: z.boolean() }),
              'POST',
              {},
            );
          access(id, true);
          const records = await Promise.all(
            (await cases.list(id, {})).items
              .filter((r) => r.status === 'decided')
              .map((r) => cases.get(id, r.id)),
          );
          const added: ModerationDesk['flags'] = [];
          for (const record of records)
            for (const prior of records) {
              if (
                record.id <= prior.id ||
                record.ruleTitle !== prior.ruleTitle ||
                record.ruleVersion !== prior.ruleVersion ||
                record.ruleText !== prior.ruleText ||
                record.outcome === prior.outcome
              )
                continue;
              if (
                state.flags.some(
                  (f) =>
                    f.origin === 'documented_outcome_comparison' &&
                    f.caseId === record.id &&
                    f.comparedCaseId === prior.id &&
                    f.caseVersion === record.version &&
                    f.comparedVersion === prior.version,
                )
              )
                continue;
              added.push({
                id: crypto.randomUUID(),
                channelId: id,
                caseId: record.id,
                comparedCaseId: prior.id,
                caseVersion: record.version,
                comparedVersion: prior.version,
                version: 1,
                status: 'open',
                origin: 'documented_outcome_comparison',
                concern: `Different recorded outcomes under ${record.ruleTitle} (version ${record.ruleVersion}). Compare severity, context and evidence before judging consistency; different outcomes can be justified.`,
                reviewNote: null,
                severityContext: '',
                evidenceContext: '',
                reviewedByTwitchUserId: null,
                reviewedAt: null,
                createdAt: now(),
                updatedAt: now(),
              });
            }
          setState((s) => ({
            ...s,
            flags: [...added.slice(0, 20), ...s.flags],
          }));
          for (const f of added.slice(0, 20))
            log(id, 'flag', f.id, f.caseId, 'flag_comparison_created', null);
          return {
            created: Math.min(20, added.length),
            hasMore: added.length > 20,
          };
        },
        generate: async (id, requestId) => {
          if (!preview) {
            await request(
              id,
              '/handoffs',
              z.strictObject({ id: z.uuid() }),
              'POST',
              { requestId },
            );
            return;
          }
          access(id, true);
          if (duplicate(id, requestId, { requestId })) return;
          const records = (await cases.list(id, {})).items;
          const handoffId = crypto.randomUUID(),
            end = now();
          const previous = state.handoffs.find((h) => h.channelId === id);
          const repairs = state.repairs.filter(
              (r) =>
                r.channelId === id &&
                !['completed', 'cancelled'].includes(r.status),
            ),
            flags = state.flags.filter(
              (f) => f.channelId === id && f.status === 'open',
            );
          const sources = [
            ...records
              .filter((r) => r.status !== 'decided')
              .map((r) => ({
                caseId: r.id,
                sourceType: 'case' as const,
                sourceId: r.id,
                sourceVersion: r.version,
                title: r.title,
                assigneeId: null,
              })),
            ...repairs.map((r) => ({
              caseId: r.caseId,
              sourceType: 'repair' as const,
              sourceId: r.id,
              sourceVersion: r.version,
              title: r.title,
              assigneeId: r.assigneeId,
            })),
            ...flags.map((f) => ({
              caseId: f.caseId,
              sourceType: 'flag' as const,
              sourceId: f.id,
              sourceVersion: f.version,
              title: 'Review consistency concern',
              assigneeId: null,
            })),
          ];
          const row: Handoff = {
            id: handoffId,
            channelId: id,
            periodStart:
              previous?.periodEnd ??
              new Date(Date.now() - 86400000).toISOString(),
            periodEnd: end,
            summary: `${sources.length} tasks for the next shift.`,
            createdByTwitchUserId: session.user.twitchUserId,
            createdAt: end,
            recentDecisions: records.filter(
              (r) =>
                r.status === 'decided' &&
                r.updatedAt >
                  (previous?.periodEnd ??
                    new Date(Date.now() - 86400000).toISOString()),
            ),
            ruleChanges: state.ruleChanges.filter(
              (r) =>
                r.channelId === id &&
                r.createdAt >
                  (previous?.periodEnd ??
                    new Date(Date.now() - 86400000).toISOString()),
            ),
            ruleContexts: records
              .filter(
                (r) =>
                  r.updatedAt >
                  (previous?.periodEnd ??
                    new Date(Date.now() - 86400000).toISOString()),
              )
              .map((r) => ({
                caseId: r.id,
                title: r.ruleTitle,
                version: r.ruleVersion,
              })),
            truncated: false,
            items: sources.map((s) => {
              const previousItem = previous?.items.find(
                (i) =>
                  i.sourceType === s.sourceType && i.sourceId === s.sourceId,
              );
              const sourceReassigned =
                s.sourceType === 'repair' &&
                previousItem?.sourceVersion !== s.sourceVersion;
              return {
                ...s,
                id: crypto.randomUUID(),
                channelId: id,
                handoffId,
                assigneeId: sourceReassigned
                  ? s.assigneeId
                  : previousItem
                    ? previousItem.assigneeId
                    : s.assigneeId,
                note: previousItem?.note ?? null,
                status: 'pending',
                version: 1,
                updatedAt: end,
              };
            }),
          };
          setState((s) => ({ ...s, handoffs: [row, ...s.handoffs] }));
          log(id, 'handoff', row.id, null, 'handoff_generated', null);
        },
        task: async (id, handoffId, itemId, input) => {
          if (!preview) {
            await request(
              id,
              `/handoffs/${handoffId}/items/${itemId}`,
              handoffItemSchema,
              'PATCH',
              input,
            );
            return;
          }
          access(id, true);
          assignee(input.assigneeId);
          const row = state.handoffs
            .find((h) => h.channelId === id && h.id === handoffId)
            ?.items.find((i) => i.id === itemId);
          if (
            !row ||
            row.version !== input.expectedVersion ||
            !handoffTaskTransitions[row.status].includes(input.status)
          )
            throw new Error('Task changed or transition unavailable.');
          setState((s) => ({
            ...s,
            handoffs: s.handoffs.map((h) =>
              h.id === handoffId
                ? {
                    ...h,
                    items: h.items.map((i) =>
                      i.id === itemId
                        ? {
                            ...i,
                            status: input.status,
                            assigneeId: input.assigneeId,
                            note: input.note,
                            version: i.version + 1,
                            updatedAt: now(),
                          }
                        : i,
                    ),
                  }
                : h,
            ),
          }));
          log(
            id,
            'task',
            row.id,
            row.caseId,
            `task_${input.status}`,
            input.note,
            input.assigneeId,
          );
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useModeration() {
  const value = useContext(Context);
  if (!value) throw new Error('ModerationProvider is required');
  return value;
}

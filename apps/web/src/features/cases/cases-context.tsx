'use client';
import { createContext, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  addCaseEvidenceSchema,
  caseAiRunSchema,
  caseAiSettingsSchema,
  caseDetailSchema,
  casePageSchema,
  createCaseSchema,
  decideCaseSchema,
  updateCaseSchema,
  type AddCaseEvidence,
  type CaseAiRun,
  type CaseDetail,
  type CreateCase,
  type DecideCase,
  type UpdateCase,
} from '@lore/shared';
import { ApiError, apiRequest } from '../../lib/api';
import { previewCases, previewPrecedents } from '../../lib/preview-cases';
import { useWorkspace } from '../workspace/workspace-context';
type CasesWorkspace = {
  list: (
    channelId: string,
    options: { status?: CaseDetail['status']; cursor?: string },
    signal?: AbortSignal,
  ) => Promise<z.infer<typeof casePageSchema>>;
  get: (
    channelId: string,
    id: string,
    signal?: AbortSignal,
  ) => Promise<CaseDetail>;
  create: (channelId: string, input: CreateCase) => Promise<CaseDetail>;
  update: (record: CaseDetail, input: UpdateCase) => Promise<CaseDetail>;
  decide: (record: CaseDetail, input: DecideCase) => Promise<CaseDetail>;
  evidence: (record: CaseDetail, input: AddCaseEvidence) => Promise<CaseDetail>;
  upload: (
    record: CaseDetail,
    file: File,
    label: string,
    requestId: string,
  ) => Promise<CaseDetail>;
  removeEvidence: (
    record: CaseDetail,
    id: string,
    reason: string,
  ) => Promise<CaseDetail>;
  settings: (
    channelId: string,
    signal?: AbortSignal,
  ) => Promise<z.infer<typeof caseAiSettingsSchema>>;
  consent: (channelId: string, enabled: boolean) => Promise<void>;
  retrieve: (record: CaseDetail) => Promise<void>;
  precedents: (
    record: CaseDetail,
    signal?: AbortSignal,
  ) => Promise<CaseAiRun | null>;
  caseHref: (id: string, channelId: string) => string;
};
const Context = createContext<CasesWorkspace | null>(null);
export function CasesProvider({ children }: { children: React.ReactNode }) {
  const { session, channels, preview } = useWorkspace();
  const router = useRouter();
  const [fixtures, setFixtures] = useState(previewCases);
  const [runs, setRuns] = useState<Record<string, CaseAiRun>>({});
  const [consents, setConsents] = useState<Record<string, boolean>>({});
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
  function access(channelId: string, mutation = false) {
    const channel = channels.find((c) => c.id === channelId);
    if (
      !channel ||
      !['owner', 'moderator'].includes(channel.role) ||
      (channel.role !== 'owner' && !channel.connected)
    )
      throw new Error('Moderation access required.');
    if (mutation && !channel.connected)
      throw new Error('Reconnect the channel first.');
    return channel;
  }
  function find(channelId: string, id: string) {
    access(channelId);
    const record = fixtures.find(
      (c) => c.channelId === channelId && c.id === id,
    );
    if (!record) throw new Error('Case not found.');
    return record;
  }
  function editable(record: CaseDetail, version: number) {
    access(record.channelId, true);
    const saved = find(record.channelId, record.id);
    if (saved.status === 'decided' || saved.version !== version)
      throw new Error('This case changed. Refresh before trying again.');
    return saved;
  }
  function save(
    record: CaseDetail,
    action: CaseDetail['history'][number]['action'],
    reason: string | null = null,
  ) {
    const now = new Date().toISOString();
    const updated = {
      ...record,
      version: record.version + 1,
      updatedAt: now,
      history: [
        ...record.history,
        {
          id: crypto.randomUUID(),
          version: record.version + 1,
          action,
          actorTwitchUserId: session.user.twitchUserId,
          reason,
          occurredAt: now,
        },
      ],
    };
    setFixtures((rows) => rows.map((r) => (r.id === record.id ? updated : r)));
    return updated;
  }
  const base = (record: CaseDetail) =>
    `/channels/${record.channelId}/cases/${record.id}`;
  return (
    <Context.Provider
      value={{
        caseHref: (id, channelId) =>
          preview
            ? `/preview?view=case&case=${id}&channel=${channelId}`
            : `/app/cases/${id}?channel=${channelId}`,
        list: async (id, options, signal) => {
          if (!preview)
            return request(
              `/channels/${id}/cases?${new URLSearchParams(options)}`,
              casePageSchema,
              'GET',
              undefined,
              signal,
            );
          access(id);
          return {
            items: fixtures
              .filter(
                (c) =>
                  c.channelId === id &&
                  (!options.status || c.status === options.status),
              )
              .map((c) => ({
                id: c.id,
                channelId: c.channelId,
                title: c.title,
                subjectReference: c.subjectReference,
                status: c.status,
                version: c.version,
                origin: c.origin,
                ruleTitle: c.ruleTitle,
                ruleVersion: c.ruleVersion,
                outcome: c.outcome,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
              })),
            nextCursor: null,
          };
        },
        get: async (channelId, id, signal) =>
          preview
            ? find(channelId, id)
            : request(
                `/channels/${channelId}/cases/${id}`,
                caseDetailSchema,
                'GET',
                undefined,
                signal,
              ),
        create: async (channelId, input) => {
          const data = createCaseSchema.parse(input);
          if (!preview)
            return request(
              `/channels/${channelId}/cases`,
              caseDetailSchema,
              'POST',
              data,
            );
          access(channelId, true);
          const now = new Date().toISOString();
          const { requestId, ...fields } = data;
          const record: CaseDetail = {
            ...fields,
            id: requestId,
            channelId,
            status: 'open',
            version: 1,
            origin: 'demo_fixture',
            outcome: null,
            rationale: null,
            followUp: null,
            decidedByTwitchUserId: null,
            decidedAt: null,
            aiRunId: null,
            aiDisposition: null,
            createdAt: now,
            updatedAt: now,
            evidence: [],
            history: [
              {
                id: crypto.randomUUID(),
                version: 1,
                action: 'created',
                actorTwitchUserId: session.user.twitchUserId,
                reason: null,
                occurredAt: now,
              },
            ],
          };
          setFixtures((rows) => [
            record,
            ...rows.filter((r) => r.id !== record.id),
          ]);
          return record;
        },
        update: async (record, input) => {
          const data = updateCaseSchema.parse(input);
          if (!preview)
            return request(base(record), caseDetailSchema, 'PATCH', data);
          const { expectedVersion, ...fields } = data;
          const saved = editable(record, expectedVersion);
          return save({ ...saved, ...fields }, 'updated');
        },
        decide: async (record, input) => {
          const data = decideCaseSchema.parse(input);
          if (!preview)
            return request(
              `${base(record)}/decision`,
              caseDetailSchema,
              'POST',
              data,
            );
          const saved = editable(record, data.expectedVersion);
          return save(
            {
              ...saved,
              status: 'decided',
              outcome: data.outcome,
              rationale: data.rationale,
              followUp: data.followUp,
              aiRunId: data.aiRunId,
              aiDisposition: data.aiDisposition,
              decidedByTwitchUserId: session.user.twitchUserId,
              decidedAt: new Date().toISOString(),
            },
            'decided',
            data.rationale,
          );
        },
        evidence: async (record, input) => {
          const data = addCaseEvidenceSchema.parse(input);
          if (!preview)
            return request(
              `${base(record)}/evidence`,
              caseDetailSchema,
              'POST',
              data,
            );
          const saved = editable(record, data.expectedVersion);
          if (data.sourceEventId)
            throw new Error('Demo fixtures cannot read live chat.');
          return save(
            {
              ...saved,
              evidence: [
                ...saved.evidence,
                {
                  id: data.requestId,
                  label: data.label,
                  excerpt: data.excerpt,
                  origin: 'demo_fixture',
                  sourceEventId: null,
                  originalAvailable: null,
                  occurredAt: data.occurredAt,
                  createdAt: new Date().toISOString(),
                  removed: false,
                  file: null,
                },
              ],
            },
            'evidence_added',
          );
        },
        upload: async (record, file, label, requestId) => {
          if (!preview) {
            const form = new FormData();
            form.set('file', file);
            form.set('label', label);
            form.set('requestId', requestId);
            form.set('expectedVersion', String(record.version));
            return request(
              `${base(record)}/files`,
              caseDetailSchema,
              'POST',
              form,
            );
          }
          const saved = editable(record, record.version);
          return save(
            {
              ...saved,
              evidence: [
                ...saved.evidence,
                {
                  id: requestId,
                  label,
                  excerpt:
                    'Demo file metadata only; no file was sent or retained.',
                  origin: 'demo_fixture',
                  sourceEventId: null,
                  originalAvailable: null,
                  occurredAt: null,
                  createdAt: new Date().toISOString(),
                  removed: false,
                  file: {
                    name: file.name,
                    contentType: file.type,
                    size: file.size,
                    available: false,
                  },
                },
              ],
            },
            'evidence_added',
          );
        },
        removeEvidence: async (record, id, reason) => {
          if (!preview)
            return request(
              `${base(record)}/evidence/${id}`,
              caseDetailSchema,
              'DELETE',
              { expectedVersion: record.version, reason },
            );
          const saved = editable(record, record.version);
          return save(
            {
              ...saved,
              evidence: saved.evidence.map((e) =>
                e.id === id
                  ? {
                      ...e,
                      removed: true,
                      excerpt: null,
                      file: e.file ? { ...e.file, available: false } : null,
                    }
                  : e,
              ),
            },
            'evidence_removed',
            reason,
          );
        },
        settings: async (id, signal) => {
          if (!preview)
            return request(
              `/channels/${id}/cases/ai/settings`,
              caseAiSettingsSchema,
              'GET',
              undefined,
              signal,
            );
          access(id);
          return {
            enabled: consents[id] ?? true,
            embeddingsConfigured: true,
            reasoningConfigured: true,
            storageConfigured: true,
            embeddingModel: 'Demo fixture · no model calls',
            reasoningModel: 'Demo fixture',
            dailyUsed: 0,
            dailyLimit: 50,
          };
        },
        consent: async (id, enabled) => {
          if (!preview) {
            await request(
              `/channels/${id}/cases/ai/settings`,
              caseAiSettingsSchema,
              'POST',
              { enabled },
            );
            return;
          }
          if (access(id).role !== 'owner')
            throw new Error('Only the owner can change case AI consent.');
          setConsents((rows) => ({ ...rows, [id]: enabled }));
        },
        retrieve: async (record) => {
          if (!preview) {
            await request(
              `${base(record)}/precedents`,
              z.object({ runId: z.uuid() }),
              'POST',
              {},
            );
            return;
          }
          access(record.channelId, true);
          setRuns((rows) => ({
            ...rows,
            [record.id]: previewPrecedents(
              find(record.channelId, record.id),
              fixtures,
            ),
          }));
        },
        precedents: async (record, signal) => {
          if (!preview)
            return request(
              `${base(record)}/precedents`,
              caseAiRunSchema.nullable(),
              'GET',
              undefined,
              signal,
            );
          find(record.channelId, record.id);
          const run = runs[record.id];
          return run
            ? {
                ...run,
                stale:
                  run.caseVersion !== record.version ||
                  consents[record.channelId] === false,
                ...(run.caseVersion !== record.version ||
                consents[record.channelId] === false
                  ? { matches: [], recommendation: null }
                  : {}),
              }
            : null;
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCases() {
  const value = useContext(Context);
  if (!value) throw new Error('CasesProvider is required');
  return value;
}

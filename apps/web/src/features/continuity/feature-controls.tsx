'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useWorkspace } from '../workspace/workspace-context';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { useFeatureSettings } from './feature-settings';
const features = [
  {
    key: 'moderationImportsEnabled',
    title: 'Import moderation events',
    description:
      'Create private review cases from new Twitch bans, timeouts and appeals. Imports keep event evidence, mark unknown rules and never decide a case or take a Twitch action.',
  },
  {
    key: 'promiseConfirmationsEnabled',
    title: 'Confirm !promise in chat',
    description:
      'Acknowledge an accepted !promise in its Twitch channel as the broadcaster. Replies have a 15-second cooldown and expire after 90 seconds. Uncertain deliveries are not repeated.',
  },
  {
    key: 'publicSummaryAiEnabled',
    title: 'Gemini public summary drafts',
    description:
      'Use selected published stories to draft editable recaps with Gemini. Private chat and cases are excluded. Every draft needs human approval before publication.',
  },
  {
    key: 'microphoneEnabled',
    title: 'Microphone follow-up suggestions',
    description:
      'Allow team members to explicitly record and submit clips up to 30 seconds to Gemini. Raw audio is not stored by Lore. Unverified transcripts and unconfirmed suggestions follow current channel chat retention; confirming preserves a separate source excerpt. Nobody is recorded automatically.',
  },
] as const;
type FeatureKey = (typeof features)[number]['key'];
export function FeatureControls({
  only,
  expanded = false,
}: {
  only?: FeatureKey[];
  expanded?: boolean;
}) {
  const { selected, preview, href } = useWorkspace();
  const [open, setOpen] = useState(expanded),
    [confirm, setConfirm] = useState<(typeof features)[number]>();
  const { settings, error, busy, configure, refresh } =
    useFeatureSettings(open);
  return (
    <details
      className="panel content-stack feature-controls"
      open={expanded || undefined}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{only ? 'Feature permissions' : 'Optional features'}</summary>
      {open && (
        <>
          <p>
            Choose which optional features your team can use. Each is off until
            the owner enables it.
          </p>
          {preview ? (
            <p className="notice">
              Demo fixture · external permissions, recording and sending are
              simulated. No channel consent is changed here.
            </p>
          ) : (
            <>
              {error && (
                <p role="alert" className="notice error">
                  {error}{' '}
                  <button
                    className="button secondary compact"
                    onClick={refresh}
                  >
                    Retry feature settings
                  </button>
                </p>
              )}
              {!settings && !error && (
                <p role="status">Loading feature consent…</p>
              )}
              {settings &&
                features
                  .filter((feature) => !only || only.includes(feature.key))
                  .map((feature) => (
                    <section key={feature.key} className="content-stack">
                      <h3>
                        {feature.title} · {settings[feature.key] ? 'On' : 'Off'}
                      </h3>
                      <p>{feature.description}</p>
                      {feature.key === 'moderationImportsEnabled' &&
                        settings.missingModerationScopes.length > 0 && (
                          <p className="notice">
                            Additional Twitch permissions required.{' '}
                            {selected?.role === 'owner' && (
                              <a href="/api/auth/twitch/moderation">
                                Authorize moderation event access
                              </a>
                            )}
                          </p>
                        )}
                      {feature.key === 'promiseConfirmationsEnabled' &&
                        !settings.chatReady && (
                          <p className="notice">
                            Start live capture and{' '}
                            <Link href={href('publications')}>
                              authorize chat replies in Public stories
                            </Link>{' '}
                            first.
                          </p>
                        )}
                      {['publicSummaryAiEnabled', 'microphoneEnabled'].includes(
                        feature.key,
                      ) &&
                        !settings.aiConfigured && (
                          <p className="notice">
                            Gemini is unavailable. Check this Lore instance’s AI
                            configuration.
                          </p>
                        )}
                      <button
                        className="button secondary"
                        disabled={
                          busy ||
                          selected?.role !== 'owner' ||
                          (!selected.connected && !settings[feature.key])
                        }
                        onClick={() =>
                          settings[feature.key]
                            ? void configure(feature.key, false)
                            : setConfirm(feature)
                        }
                      >
                        {settings[feature.key] ? 'Disable' : 'Enable'}{' '}
                        {feature.title.toLowerCase()}
                      </button>
                    </section>
                  ))}
              {selected?.role !== 'owner' && (
                <p className="muted">
                  Only the channel owner can change these opt-ins.
                </p>
              )}
            </>
          )}
          {confirm && (
            <ConfirmDialog
              tone="primary"
              title={`Enable ${confirm.title.toLowerCase()}?`}
              confirmLabel="Enable capability"
              busy={busy}
              onCancel={() => setConfirm(undefined)}
              onConfirm={async () => {
                if (await configure(confirm.key, true)) setConfirm(undefined);
              }}
            >
              <p>{confirm.description}</p>
              {error && (
                <p role="alert" className="notice error">
                  {error}
                </p>
              )}
              {['publicSummaryAiEnabled', 'microphoneEnabled'].includes(
                confirm.key,
              ) && (
                <p>
                  Google may use free-tier AI inputs and outputs to improve its
                  products.
                </p>
              )}
            </ConfirmDialog>
          )}
        </>
      )}
    </details>
  );
}

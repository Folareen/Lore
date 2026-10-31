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
      'Import future bans, timeouts and unban requests as private, open review cases with retained event evidence. Rules not supplied by Twitch are explicitly marked unknown. Imported resolutions never make a Lore decision or execute a Twitch action.',
  },
  {
    key: 'promiseConfirmationsEnabled',
    title: 'Confirm !promise in chat',
    description:
      'After saving an authorized command, send: “Promise saved in Lore. The team can review it in the next-stream brief.” Replies stay in the source channel, expire after 90 seconds and have a 15-second channel cooldown. An ambiguous send is not replayed.',
  },
  {
    key: 'publicSummaryAiEnabled',
    title: 'Gemini public summary drafts',
    description:
      'Allow the team to send selected, already-published community entries to Gemini for editable recap drafts. Private cases and raw chat are excluded. Every draft still needs human publication approval.',
  },
  {
    key: 'microphoneEnabled',
    title: 'Microphone follow-up suggestions',
    description:
      'Allow team members to explicitly record and submit clips up to 30 seconds to Gemini. Raw audio is not stored by Lore. Unverified transcripts and unconfirmed suggestions follow current channel chat retention; confirming preserves a separate source excerpt. Nobody is recorded automatically.',
  },
] as const;
export function FeatureControls() {
  const { selected, preview, href } = useWorkspace();
  const [open, setOpen] = useState(false),
    [confirm, setConfirm] = useState<(typeof features)[number]>();
  const { settings, error, busy, configure, refresh } =
    useFeatureSettings(open);
  return (
    <details
      className="panel content-stack"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Additional channel capabilities</summary>
      {open && (
        <>
          <p>
            Each capability is off until the owner enables it. Google may use
            free-tier AI inputs and outputs to improve its products.
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
                features.map((feature) => (
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
                            authorize chat replies in Community publishing
                          </Link>{' '}
                          first.
                        </p>
                      )}
                    {['publicSummaryAiEnabled', 'microphoneEnabled'].includes(
                      feature.key,
                    ) &&
                      !settings.aiConfigured && (
                        <p className="notice">
                          Configure GEMINI_API_KEY first.
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
              title={`Enable ${confirm.title.toLowerCase()}?`}
              confirmLabel="Enable capability"
              busy={busy}
              onCancel={() => setConfirm(undefined)}
              onConfirm={async () => {
                await configure(confirm.key, true);
                setConfirm(undefined);
              }}
            >
              <p>{confirm.description}</p>
              <p>
                Google may use free-tier AI inputs and outputs to improve its
                products. Review this before enabling AI capabilities.
              </p>
            </ConfirmDialog>
          )}
        </>
      )}
    </details>
  );
}

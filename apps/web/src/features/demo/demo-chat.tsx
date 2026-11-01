'use client';
import { PageTitle } from '../../components/page-title';
import { Select } from '../../components/select';
import { useState } from 'react';
import Link from 'next/link';
import { parsePromiseCommand } from '@lore/shared';
import { useWorkspace } from '../workspace/workspace-context';
import { usePublications } from '../publications/publications-context';
import { useDemo } from './demo-seed-context';
export function DemoChat() {
  const demo = useDemo(),
    { selected, session, recordPreviewReview, href } = useWorkspace(),
    publications = usePublications();
  const [command, setCommand] = useState(
      '!promise Name the garden pond with chat next stream.',
    ),
    [role, setRole] = useState('broadcaster'),
    [reply, setReply] = useState('');
  if (!demo || !selected)
    return (
      <p className="notice">Open the seeded demo to simulate chat commands.</p>
    );
  function send(event: React.FormEvent) {
    event.preventDefault();
    if (!selected?.connected) {
      setReply('Reconnect the demo channel or reset the demo first.');
      return;
    }
    if (/^!catchup\s*$/i.test(command.trim())) {
      const summary = publications.publicCatchup(selected.id).summary;
      setReply(
        summary
          ? `Catch up: ${summary.chatSummary}`
          : 'No catch-up summary has been approved yet.',
      );
      return;
    }
    const wording = parsePromiseCommand({
      broadcaster_user_id: selected.twitchChannelId!,
      chatter_user_id:
        role === 'broadcaster' ? selected.twitchChannelId! : '200',
      message: { text: command },
      badges: role === 'viewer' ? [] : [{ set_id: role }],
    });
    if (!wording) {
      setReply(
        'Use !catchup, or send !promise followed by a commitment as the broadcaster or a moderator.',
      );
      return;
    }
    const now = new Date().toISOString();
    recordPreviewReview({
      id: crypto.randomUUID(),
      channelId: selected.id,
      wording,
      ownerLabel: session.user.displayName,
      dueContext: null,
      status: 'confirmed',
      version: 1,
      origin: 'demo_fixture',
      captureMethod: 'chat_command',
      createdAt: now,
      updatedAt: now,
      source: { excerpt: command.trim(), originalAvailable: null },
    });
    setReply('Simulated promise saved. Open the next-stream brief to see it.');
  }
  return (
    <div className="content-stack">
      <div className="page-heading">
        <div>
          <p className="record-meta">Demo fixture · Chat simulation</p>
          <PageTitle>Try a command.</PageTitle>
          <p>
            Nothing is sent to Twitch. This illustrates the promise and catch-up
            flows using your current demo state.
          </p>
        </div>
      </div>
      <form className="panel" onSubmit={send}>
        <div className="field">
          <label htmlFor="demo-speaker">Simulated speaker</label>
          <Select
            id="demo-speaker"
            value={role}
            onValueChange={(e) => setRole(e)}
          >
            <option value="broadcaster">Broadcaster</option>
            <option value="moderator">Moderator</option>
            <option value="viewer">Viewer</option>
          </Select>
        </div>
        <div className="field">
          <label htmlFor="demo-command">Simulated chat message</label>
          <input
            id="demo-command"
            maxLength={2010}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
          />
        </div>
        <div className="button-row">
          <button className="button primary">Simulate command</button>
          <button
            className="button secondary"
            type="button"
            onClick={() => setCommand('!catchup')}
          >
            Use !catchup
          </button>
        </div>
      </form>
      {reply && (
        <p className="notice" role="status">
          {reply}
        </p>
      )}
      <div className="button-row">
        <Link className="button secondary" href={href('brief')}>
          Open next-stream brief
        </Link>
        <Link href={href('publications')}>Review public wording →</Link>
      </div>
      <p className="notice">
        Simulated badges are not Twitch verification. Live ingestion validates
        signed EventSub deliveries and real badge data. Live !catchup requires
        owner opt-in and Twitch sending permissions; the demo does not exercise
        network delivery, cooldown or retries.
      </p>
    </div>
  );
}

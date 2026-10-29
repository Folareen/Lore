'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useDemo } from './demo-seed-context';
import { useWorkspace } from '../workspace/workspace-context';
import { ConfirmDialog } from '../../components/confirm-dialog';
export function DemoToolbar() {
  const demo = useDemo(),
    { href } = useWorkspace();
  const [confirm, setConfirm] = useState(false);
  if (!demo) return null;
  return (
    <div className="demo-toolbar">
      <nav aria-label="Demo journey">
        <Link href="/demo">Demo guide</Link>
        <Link href="/demo?view=chat">Chat simulation</Link>
        <Link href={href('streamer')}>Streamer home</Link>
        <Link href={href('moderation')}>Moderator desk</Link>
        <Link href={href('community')}>Community Lore</Link>
      </nav>
      <button
        className="button secondary compact"
        onClick={() => setConfirm(true)}
      >
        Reset demo
      </button>
      {confirm && (
        <ConfirmDialog
          title="Reset your demo?"
          confirmLabel="Reset demo"
          busy={false}
          onCancel={() => setConfirm(false)}
          onConfirm={demo.reset}
        >
          <p>
            Your changes in this demo session will be discarded. The original
            seeded story will return. Other visitors are unaffected.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
export function DemoHome() {
  const demo = useDemo(),
    { href } = useWorkspace();
  if (!demo) return null;
  return (
    <div className="content-stack demo-guide">
      <div className="page-heading">
        <div>
          <p className="eyebrow">DEMO FIXTURE · ABOUT THREE MINUTES</p>
          <h1>The next stream remembers.</h1>
          <p>
            Meet cozybyte’s community: an island garden, a promise to finish the
            tour, and a spoiler appeal that needs a human decision.
          </p>
        </div>
      </div>
      <p className="notice">
        Everything here is synthetic. You can edit and review it freely. Changes
        stay in this tab and reset on refresh. No Twitch account or provider key
        is needed.
      </p>
      <ol className="demo-journey">
        <li>
          <span className="eyebrow">01 · STREAMER HOME</span>
          <h2>Carry a promise into the next stream.</h2>
          <p>
            Open the island-tour promise, change its status, then check the
            brief. Review a suggested commitment and decide whether it belongs
            on the list.
          </p>
          <div className="button-row">
            <Link className="button primary" href={href('streamer')}>
              Start with open loops
            </Link>
            <Link className="button secondary" href="/demo?view=chat">
              Simulate !promise / !catchup
            </Link>
            <Link className="button secondary" href={href('candidates')}>
              Review a suggestion
            </Link>
            <Link href={href('brief')}>Next-stream brief →</Link>
          </div>
        </li>
        <li>
          <span className="eyebrow">02 · MODERATOR DESK</span>
          <h2>Context before a decision.</h2>
          <p>
            Review the repeated spoiler warning, read its evidence and compare
            the earlier appeal. Recommendations are labeled simulations. Your
            decision, rationale and repair action remain human choices.
          </p>
          <div className="button-row">
            <Link className="button secondary" href={href('moderation')}>
              Open moderation cases
            </Link>
            <Link href={href('workflows')}>Read the seeded handoff →</Link>
          </div>
        </li>
        <li>
          <span className="eyebrow">03 · COMMUNITY LORE</span>
          <h2>Let newcomers join the story.</h2>
          <p>
            Read the approved garden recap and public commitment. Withdraw a
            source in Community publishing and see its dependent recap
            disappear. Private moderation details stay out of the visitor view.
          </p>
          <div className="button-row">
            <Link className="button secondary" href={href('community')}>
              Catch up as a newcomer
            </Link>
            <Link href={href('publications')}>Community publishing →</Link>
            <Link href={href('overlay')}>Preview the OBS selection →</Link>
          </div>
        </li>
      </ol>
      <p className="notice">
        The demo starts with {demo.data.loops.length} promises,{' '}
        {demo.data.cases.length} cases, a consistency concern, a repair action
        and a saved handoff. Provider results, chat and OBS credentials are
        simulations; no external action is performed.
      </p>
    </div>
  );
}
export function DemoUnavailable() {
  return (
    <main id="main-content" className="demo-unavailable panel">
      <p className="eyebrow">DEMO FIXTURE</p>
      <h1>The demo is taking a break.</h1>
      <p>
        The seeded workspace could not be loaded. Try again shortly, or explore
        the built-in fixture preview.
      </p>
      <div className="button-row">
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
        <Link className="button secondary" href="/preview">
          Open fixture preview
        </Link>
        <Link href="/">Back to Lore</Link>
      </div>
    </main>
  );
}

'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useDemo } from './demo-seed-context';
import { useWorkspace } from '../workspace/workspace-context';
import { ConfirmDialog } from '../../components/confirm-dialog';
export function DemoToolbar() {
  const demo = useDemo(),
    { href } = useWorkspace();
  const [confirm, setConfirm] = useState(false);
  const tools = useRef<HTMLDetailsElement>(null);
  if (!demo) return null;
  function close() {
    if (tools.current) {
      tools.current.open = false;
      tools.current.querySelector('summary')?.focus();
    }
  }
  return (
    <div className="demo-tools">
      <details
        ref={tools}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
      >
        <summary>Demo tools</summary>
        <div className="demo-tools-menu">
          <nav aria-label="Demo tools">
            <Link href="/demo?view=guide" onClick={close}>
              Demo guide
            </Link>
            <Link href="/demo?view=chat" onClick={close}>
              Chat simulation
            </Link>
            <Link href={href('community')} onClick={close}>
              Public viewer preview
            </Link>
          </nav>
          <button
            className="button secondary compact"
            onClick={() => {
              close();
              setConfirm(true);
            }}
          >
            Reset demo
          </button>
        </div>
      </details>
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
          <p className="record-meta">Demo fixture · About three minutes</p>
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

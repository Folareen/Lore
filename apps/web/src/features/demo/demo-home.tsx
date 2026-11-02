'use client';
import { SectionTabs } from '../../components/section-tabs';
import {
  audiences,
  guides,
  demoGuideHref,
  type GuideAudience,
  type GuideView,
} from '../help/guides';
import { PageTitle } from '../../components/page-title';
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
            <Link href={href('discover')} onClick={close}>
              Discover sample communities
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
const journeys: Record<
  GuideAudience,
  { title: string; body: string; view: GuideView; action: string }[]
> = {
  streamers: [
    {
      title: 'Carry a promise into the next stream',
      body: 'Open the island-tour promise, move it to In progress, then check the brief. Completed and postponed examples are already in the list.',
      view: 'streamer',
      action: 'Start with promises',
    },
    {
      title: 'Review a suggestion',
      body: 'Read the games-list quote and its missing details. Confirm an edited promise or dismiss it with a reason. The other filters include reviewed and unavailable examples.',
      view: 'candidates',
      action: 'Review suggestions',
    },
    {
      title: 'Publish a ready-to-review draft',
      body: 'Open the pond-naming announcement, inspect its wording and approve publication. Switch to the visitor view to see the result. Drafts and a withdrawn example stay private.',
      view: 'publications',
      action: 'Open Public stories',
    },
    {
      title: 'Choose what appears on stream',
      body: 'Inspect the recap preview, change the selected public entries and approve your display. OBS setup creates a clearly invalid sample credential; it cannot connect to a live channel.',
      view: 'overlay',
      action: 'Try the stream overlay',
    },
  ],
  moderators: [
    {
      title: 'Read an appeal with its evidence',
      body: 'Open the repeated spoiler warning. Its incident note and rule snapshot explain what is known and what is missing.',
      view: 'sampleAppeal',
      action: 'Open the sample appeal',
    },
    {
      title: 'Compare an earlier human decision',
      body: 'In Review & decision, retrieve the simulated precedent. Compare rule versions, edit the decision and save your own rationale.',
      view: 'moderation',
      action: 'Explore the case list',
    },
    {
      title: 'Follow through after a decision',
      body: 'The shift desk includes pending and completed repair actions plus open and reviewed consistency concerns. Inspect the linked case before updating a task.',
      view: 'workflows',
      action: 'Open the shift desk',
    },
    {
      title: 'Read the next-shift handoff',
      body: 'Review the saved decisions, documented rule change and unresolved task. Acknowledge the handoff task and record a useful note.',
      view: 'workflows',
      action: 'Read the sample handoff',
    },
  ],
  viewers: [
    {
      title: 'Find a community, then join the story',
      body: 'Search for cozybyte in the sample directory, open the channel and read its latest approved recap. Only published stories appear here.',
      view: 'discover',
      action: 'Discover the sample community',
    },
    {
      title: 'Learn an inside reference',
      body: 'Find out why chat calls itself the moss club, then follow the recap’s source links back to individual stories.',
      view: 'sampleReference',
      action: 'What is the moss club?',
    },
    {
      title: 'Open a moment',
      body: 'See the sample image attachment and its description. A separate, clearly labeled Twitch clip demonstrates optional video playback.',
      view: 'sampleImage',
      action: 'View the image story',
    },
    {
      title: 'Ask the community guide',
      body: 'Open Ask about the community and ask what is planned next. Demo answers use the approved sample stories; private moderator notes are excluded.',
      view: 'community',
      action: 'Try the community guide',
    },
  ],
};
export function DemoHome() {
  const demo = useDemo(),
    { href } = useWorkspace();
  const [audience, setAudience] = useState('streamers');
  if (!demo) return null;
  return (
    <div className="content-stack demo-guide">
      <div className="page-heading">
        <div>
          <PageTitle>The next stream remembers.</PageTitle>
          <p>
            Explore cozybyte’s island garden as a streamer, moderator or
            newcomer. Choose a path and try the actual screens.
          </p>
        </div>
      </div>
      <p className="notice">
        Sample data. Changes stay in this visit and reset on refresh. Chat, AI
        and OBS actions are simulations; the optional Twitch sample clip uses
        real playback.
      </p>
      <SectionTabs
        label="Choose a demo path"
        value={audience}
        onValueChange={setAudience}
        tabs={audiences.map((key) => ({
          value: key,
          label: guides[key].label,
          content: (
            <ol className="demo-journey">
              {journeys[key].map((step) => (
                <li key={step.title}>
                  <h2>{step.title}</h2>
                  <p>{step.body}</p>
                  <Link
                    className="button secondary"
                    href={demoGuideHref(step.view)}
                  >
                    {step.action} →
                  </Link>
                </li>
              ))}
            </ol>
          ),
        }))}
      />
      <div className="demo-guide-footer">
        <Link href={href('chat')}>Simulate !promise / !catchup →</Link>
        <Link href={href('help')}>Need setup details? Help & guides →</Link>
      </div>
    </div>
  );
}

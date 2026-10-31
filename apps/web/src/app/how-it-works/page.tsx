import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Bookmark, ShieldCheck, Users } from 'lucide-react';
import {
  MarketingHeader,
  MarketingFooter,
} from '../../features/marketing/marketing-shell';
export const metadata: Metadata = {
  title: 'How Lore works',
  description:
    'From a promise in Twitch chat to the next-stream brief, a clear moderator handoff and a welcoming community catch-up.',
};
export default function HowItWorks() {
  return (
    <div className="landing">
      <MarketingHeader />
      <main id="main-content" className="how-page">
        <section className="how-intro">
          <p className="eyebrow">A quick tour</p>
          <h1>
            One community.
            <br />
            Fewer loose ends.
          </h1>
          <p>
            Lore connects the things your streamer, mods and viewers need to
            remember. Here’s where to start.
          </p>
          <Link className="button primary" href="/demo">
            Try it with a sample community{' '}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>
        <section className="how-steps" aria-label="Getting started">
          <article>
            <span className="how-step-icon">
              <Users size={26} aria-hidden="true" />
            </span>
            <div>
              <p className="section-number">01 / Your space</p>
              <h2>Connect your channel. Invite your people.</h2>
              <p>
                Sign in with Twitch and connect your own channel. Add moderators
                and team members by their Twitch user ID after they’ve signed in
                to Lore. The channel owner controls access.
              </p>
            </div>
          </article>
          <article>
            <span className="how-step-icon">
              <Bookmark size={26} aria-hidden="true" />
            </span>
            <div>
              <p className="section-number">02 / Between streams</p>
              <h2>Keep promises where you’ll see them.</h2>
              <p>
                Save a commitment in the dashboard, or enable live capture and
                use <code>!promise</code> as the broadcaster or a Twitch
                moderator. Review open promises in the next-stream brief, then
                mark what’s done or leave a reason when plans change.
              </p>
              <p>
                Optional Gemini suggestions can help surface follow-ups. A
                person decides which suggestions become confirmed promises.
              </p>
            </div>
          </article>
          <article>
            <span className="how-step-icon">
              <ShieldCheck size={26} aria-hidden="true" />
            </span>
            <div>
              <p className="section-number">03 / Behind the scenes</p>
              <h2>Give the next mod the context.</h2>
              <p>
                Keep incident details, applicable rules, evidence and human
                decisions in private cases. Compare earlier cases from your
                channel, document follow-ups and leave a handoff for the next
                shift.
              </p>
              <p>
                With separate permission and owner opt-in, future Twitch bans,
                timeouts and unban requests can arrive as open review cases.
                Recording a decision in Lore doesn’t perform an action on
                Twitch.
              </p>
            </div>
          </article>
          <article>
            <span className="how-step-icon">
              <Users size={26} aria-hidden="true" />
            </span>
            <div>
              <p className="section-number">04 / Out in the community</p>
              <h2>Publish something worth catching up on.</h2>
              <p>
                Your team prepares community stories and recap drafts. An owner
                or moderator reviews and publishes them. Viewers can read the
                public pages without an account; optional <code>!catchup</code>{' '}
                replies and an OBS overlay share reviewed public copy.
              </p>
              <Link href="/demo?view=community" className="text-link">
                See the newcomer view{' '}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </article>
        </section>
        <section id="permissions" className="how-permissions">
          <p className="eyebrow">You choose what’s connected</p>
          <h2>Sign-in is just the beginning.</h2>
          <p>
            Logging in identifies your Twitch account. It doesn’t turn on chat
            capture, moderation imports, AI or chat replies.
          </p>
          <dl>
            <div>
              <dt>Channel access</dt>
              <dd>
                Owners grant roles inside Lore. Twitch moderator status alone
                doesn’t open the private workspace.
              </dd>
            </div>
            <div>
              <dt>Private and public</dt>
              <dd>
                Case files, appeals and internal notes stay private. Public
                entries are separate, reviewed records. Changing a source
                withdraws dependent summaries for review.
              </dd>
            </div>
            <div>
              <dt>Captured chat</dt>
              <dd>
                Owners choose 1–7 days of retention. Confirmed promises and case
                evidence retain separate excerpts for context.
              </dd>
            </div>
            <div>
              <dt>Optional AI</dt>
              <dd>
                Gemini features have separate owner consent. Google may use
                free-tier inputs and outputs to improve its products. Review
                content before sending it, and verify every suggestion.
              </dd>
            </div>
            <div>
              <dt>Microphone capture</dt>
              <dd>
                Nothing records automatically. After owner opt-in, you choose to
                record up to 30 seconds, preview it locally and submit it. Lore
                stores the transcript, not the audio.
              </dd>
            </div>
          </dl>
        </section>
        <section className="how-next">
          <h2>See it before you connect anything.</h2>
          <p>
            The demo has a streamer, a moderator shift and a newcomer’s view
            ready to explore.
          </p>
          <Link className="button primary" href="/demo">
            Open the demo <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link href="/login" className="text-link">
            Ready? Sign in with Twitch
          </Link>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  MonitorPlay,
} from 'lucide-react';
import { TwitchMark } from '../components/brand';
import { LandingStory } from '../components/landing-story';
import { Avatar } from '../components/avatar';
import {
  MarketingHeader,
  MarketingFooter,
} from '../features/marketing/marketing-shell';
import { MemoryGame } from '../features/marketing/memory-game';
export default function Home() {
  return (
    <div className="landing">
      <MarketingHeader />
      <main id="main-content">
        <section className="landing-intro" id="the-story">
          <div className="intro-heading">
            <h1>
              The stream ends.
              <br />
              The <span className="lore-word">lore</span> doesn’t.
            </h1>
          </div>
          <div className="intro-aside">
            <p>
              Keep your promises, give your mods the context, and bring new
              viewers into the story.
            </p>
            <p className="muted">Shared memory for your Twitch community.</p>
            <div className="hero-actions">
              <Link href="/login" className="button primary">
                <TwitchMark size={18} />
                Start with Twitch
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <Link className="button secondary" href="/demo">
                Try the demo
              </Link>
            </div>
          </div>
        </section>
        <LandingStory />
        <div className="stage-caption">
          <span>A made-up stream. A familiar situation.</span>
          <span>Pick a chapter above to see what happens.</span>
        </div>
        <section className="story-explainer" id="how-it-works">
          <div>
            <h2>
              Chat moves on.
              <br />
              The good stuff stays.
            </h2>
          </div>
          <div className="explanation-copy">
            <p>
              The island tour you promised. The reason behind a mod’s call. That
              one joke nobody explains to newcomers.
            </p>
            <p className="muted">
              Lore gives each a place to go, with the source attached and your
              team in control.
            </p>
          </div>
        </section>
        <section
          className="workflow-showcase"
          aria-label="What you can do with Lore"
        >
          <article className="promise-scene">
            <div className="workflow-description">
              <h2>
                “Next stream”
                <br />
                has a place now.
              </h2>
              <p>
                Save a promise from your dashboard or with <code>!promise</code>{' '}
                in chat. Review optional chat or microphone suggestions before
                confirming them. Your next-stream brief brings open commitments
                and recent community updates together.
              </p>
              <Link href="/demo?view=brief" className="text-link">
                Explore a stream brief{' '}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="product-sample sample-promises">
              <p className="sample-caption">Example · Next-stream brief</p>
              <div className="sample-heading">
                <Avatar name="cozybyte" size={36} />
                <strong>Before we go live</strong>
                <Bookmark size={19} aria-hidden="true" />
              </div>
              <div className="sample-promise">
                <span className="status purple">In progress</span>
                <h3>Finish the community island tour</h3>
                <p>Cozybyte · Next stream</p>
                <small>
                  Source: “We’ll check out everyone’s gardens next time.”
                </small>
              </div>
              <div className="sample-change">
                <Check size={17} aria-hidden="true" />
                <span>The community garden is open.</span>
              </div>
            </div>
          </article>
          <article className="workflow-scene handoff-scene">
            <div className="workflow-description">
              <h2>
                A handoff.
                <br />
                Not a guessing game.
              </h2>
              <p>
                Keep rules, evidence and earlier decisions in one private case
                file. Leave the next mod a clear handoff, with follow-ups they
                can act on.
              </p>
              <Link href="/demo?view=moderation" className="text-link">
                Look inside a case <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="product-sample sample-handoff">
              <p className="sample-caption">
                Example · Private moderator handoff
              </p>
              <div className="sample-heading">
                <ShieldCheck size={24} aria-hidden="true" />
                <strong>For the next shift</strong>
                <span className="status neutral">Private</span>
              </div>
              <h3>Spoiler appeal needs a second look</h3>
              <p>
                Read the saved incident note and rule version before making the
                call.
              </p>
              <div className="sample-source">
                <Avatar name="moss.jpeg" size={30} />
                <span>
                  <strong>moss.jpeg</strong>
                  <small>Left a note and linked the evidence</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </div>
              <p className="sample-caption">
                People decide. Lore keeps the context.
              </p>
            </div>
          </article>
          <article className="community-scene">
            <div className="workflow-description">
              <h2>You don’t have to have been there.</h2>
              <p>
                Find a channel through Discover, read its catch-up and ask the
                community guide about a stream or an inside reference. Answers
                link to the published stories behind them. No account needed.
              </p>
              <div className="landing-task-links">
                <Link href="/discover" className="text-link">
                  Discover communities{' '}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/demo?view=community" className="text-link">
                  Try the public guide{' '}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div className="community-window">
              <div className="newcomer-arrival">
                <Avatar name="new-friend" size={40} />
                <blockquote>
                  “First stream here. What’s with the garden?”
                </blockquote>
                <span>Every new viewer starts somewhere.</span>
              </div>
              <div className="product-sample sample-community">
                <p className="sample-caption">
                  Example · Public community guide
                </p>
                <MessageCircle size={28} aria-hidden="true" />
                <h3>So, what’s with the garden?</h3>
                <p>
                  Chat built an island garden together. We’re naming the pond
                  next — bring your worst puns.
                </p>
                <Link
                  className="text-link"
                  href="/demo?view=community&entry=00000000-0000-4000-8000-000000007002"
                >
                  Source: The community garden is open{' '}
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <div className="sample-source">
                  <span className="mini-faces">
                    <Avatar name="pixel" size={28} />
                    <Avatar name="juniper" size={28} />
                    <Avatar name="new-friend" size={28} />
                  </span>
                  <span>You’re caught up. Welcome in.</span>
                </div>
              </div>
            </div>
          </article>
          <article className="workflow-scene overlay-scene">
            <div className="workflow-description">
              <h2>Bring the context back on stream.</h2>
              <p>
                Choose an approved recap or public plans for your OBS overlay.
                Let <code>!catchup</code> share the reviewed short version in
                Twitch chat. Update the story once, then share it where your
                viewers are.
              </p>
              <p>
                Public stories can also carry a Twitch clip and a screenshot, so
                the moment has something to point to.
              </p>
              <Link href="/demo?view=overlay" className="text-link">
                Preview the stream overlay{' '}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="product-sample sample-overlay">
              <p className="sample-caption">
                Example · Approved public overlay
              </p>
              <div className="sample-heading">
                <MonitorPlay size={24} aria-hidden="true" />
                <strong>Previously on cozybyte</strong>
                <span className="status purple">Reviewed</span>
              </div>
              <div className="landing-overlay-preview">
                <p>
                  The community garden is open! Chat picked the first plants.
                  Next up: naming the pond together.
                </p>
              </div>
              <p className="muted">
                Only your approved public selection appears on stream.
              </p>
              <Link
                href="/demo?view=community&entry=00000000-0000-4000-8000-000000007005"
                className="text-link"
              >
                Open a story with a clip{' '}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </article>
        </section>
        <section className="crew-section crew-compact" id="your-crew">
          <div className="section-heading">
            <h2>A place for the whole crew.</h2>
          </div>
          <div className="crew-stories">
            <article className="crew-story lilac">
              <Avatar name="cozybyte" size={42} />
              <h3>Streamers</h3>
              <p>
                Follow through on promises and start the next stream with a
                plan.
              </p>
            </article>
            <article className="crew-story mint">
              <Avatar name="moss.jpeg" size={42} />
              <h3>Moderators & teams</h3>
              <p>
                Review context, share the handoff and prepare the next community
                update.
              </p>
            </article>
            <article className="crew-story peach">
              <Avatar name="new-friend" size={42} />
              <h3>Viewers</h3>
              <p>
                Catch up on the community’s stories. No Lore account needed.
              </p>
            </article>
          </div>
        </section>
        <section className="trust-note">
          <LockKeyhole size={25} aria-hidden="true" />
          <div>
            <h2>Your private work stays private.</h2>
            <p>
              Case files and team notes stay in your private team area. Public
              stories are separate records that an owner or moderator reviews
              before publishing. Team AI tools require owner opt-in and human
              review. The public guide uses only published story text; owners
              can turn it off.
            </p>
            <Link href="/how-it-works#permissions" className="text-link">
              How access works <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </section>
        <section className="landing-questions" id="questions">
          <div>
            <h2>A few good questions.</h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>Do I need a Twitch account?</summary>
              <p>
                Streamers and team members sign in with Twitch. Viewers can read
                published community pages without signing in. You can also try
                the demo without an account.
              </p>
            </details>
            <details>
              <summary>Will Lore moderate my chat for me?</summary>
              <p>
                No. Lore helps your team review cases and remember decisions. It
                doesn’t warn, time out, ban or unban anyone on Twitch.
              </p>
            </details>
            <details>
              <summary>What happens when I try the demo?</summary>
              <p>
                You get a sample community with promises, cases and public
                stories to explore. Changes stay in your browser session and
                reset on refresh. Chat, AI and OBS actions are simulations; the
                optional sample clip loads real Twitch playback.
              </p>
            </details>
            <details>
              <summary>Can I try it without configuring AI?</summary>
              <p>
                Yes. You can capture promises, review cases, manage handoffs and
                publish stories yourself. Gemini suggestions are optional, and
                every suggestion needs human review. The live public Q&A guide
                needs a configured Gemini connection.
              </p>
            </details>
            <details>
              <summary>
                Can the community guide read private chat or cases?
              </summary>
              <p>
                No. It answers from that channel’s approved public stories and
                links to its sources. If the published material does not cover
                your question, it should say so. Check the linked story before
                treating an AI answer as a fact.
              </p>
            </details>
            <details>
              <summary>Can I search for any Twitch channel?</summary>
              <p>
                Discover searches connected communities that have published on
                Lore. It does not search every Twitch channel or reveal private,
                unpublished workspaces.
              </p>
            </details>
          </div>
        </section>
        <MemoryGame />
        <section className="closing-section">
          <div>
            <h2>
              Give the next “remember when?”
              <br />
              somewhere to live.
            </h2>
          </div>
          <div>
            <Link className="button primary" href="/demo">
              Find your way around <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <p className="closing-caption">
              A sample community. No sign-in needed.
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

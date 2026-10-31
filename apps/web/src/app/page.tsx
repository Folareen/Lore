import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
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
            <Link href="/login" className="button primary">
              <TwitchMark size={18} />
              Start with Twitch
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <Link className="quiet-link" href="/how-it-works">
              Take a look around <ArrowRight size={15} aria-hidden="true" />
            </Link>
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
          <article className="workflow-scene">
            <div className="workflow-description">
              <h2>
                “Next stream”
                <br />
                has a place now.
              </h2>
              <p>
                Save a promise from your dashboard or with <code>!promise</code>{' '}
                in chat. Your next-stream brief brings open commitments and
                recent community updates together.
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
          <article className="workflow-scene reverse">
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
                Read the saved clip context and rule version before making the
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
          <article className="workflow-scene">
            <div className="workflow-description">
              <h2>
                You don’t have to
                <br />
                have been there.
              </h2>
              <p>
                Publish the stories your community wants to share. New viewers
                get a catch-up page they can read without an account, and{' '}
                <code>!catchup</code> can share the approved recap in chat.
              </p>
              <Link href="/demo?view=community" className="text-link">
                Be the new viewer <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="product-sample sample-community">
              <p className="sample-caption">Example · Public Community Lore</p>
              <MessageCircle size={28} aria-hidden="true" />
              <h3>So, what’s with the garden?</h3>
              <p>
                Chat built an island garden together. We’re naming the pond next
                — bring your worst puns.
              </p>
              <div className="sample-source">
                <span className="mini-faces">
                  <Avatar name="pixel" size={28} />
                  <Avatar name="juniper" size={28} />
                  <Avatar name="new-friend" size={28} />
                </span>
                <span>You’re caught up. Welcome in.</span>
              </div>
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
              Case files and team notes stay in the workspace. Public stories
              are separate records that an owner or moderator reviews before
              publishing. Optional AI features require owner consent and human
              review.
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
                reset on refresh. Nothing is sent to Twitch.
              </p>
            </details>
            <details>
              <summary>Can I try it without configuring AI?</summary>
              <p>
                Yes. You can capture promises, review cases, manage handoffs and
                publish stories yourself. Gemini suggestions are optional, and
                every suggestion needs human review.
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

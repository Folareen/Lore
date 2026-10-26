import Link from 'next/link';
import {
  ArrowDown,
  ArrowUpRight,
  ArrowRight,
  Bookmark,
  Check,
  Headphones,
  ShieldCheck,
} from 'lucide-react';
import { Brand, TwitchMark } from '../components/brand';
import { ThemeToggle } from '../components/theme-control';
import { LandingStory } from '../components/landing-story';
import { Avatar } from '../components/avatar';
export default function Home() {
  return (
    <div className="landing">
      <header className="site-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#the-story">The story</a>
          <a href="#how-it-works">How it works</a>
          <a href="#your-crew">For your crew</a>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <Link className="text-link login-link" href="/login">
            Log in
          </Link>
          <Link className="button primary compact" href="/login">
            <TwitchMark size={17} />
            Get Lore
            <ArrowUpRight size={17} />
          </Link>
        </div>
      </header>
      <main id="main-content">
        <section className="landing-intro" id="the-story">
          <div className="intro-heading">
            <p className="eyebrow">
              <span className="live-dot" /> GOOD STREAMS. BETTER MEMORY.
            </p>
            <h1>
              The stream ends.
              <br />
              The <span className="lore-word">lore</span> doesn’t.
            </h1>
          </div>
          <div className="intro-aside">
            <p>
              The promises. The inside jokes.
              <br />
              The “you had to be there” moments.
            </p>
            <p>
              Keep the bits that make
              <br />
              your community, <strong>your community.</strong>
            </p>
            <Link href="/login" className="button primary">
              Make room for your story
              <ArrowUpRight size={19} />
            </Link>
            <a className="quiet-link" href="#how-it-works">
              A little look around
              <ArrowDown size={15} />
            </a>
          </div>
        </section>
        <LandingStory />
        <div className="stage-caption">
          <span>Shared memory for Twitch communities.</span>
          <span>Made for the next “remember when?”</span>
        </div>
        <section className="story-explainer" id="how-it-works">
          <div>
            <p className="eyebrow">CHAT MOVES FAST. STORIES STICK.</p>
            <h2>
              Some things deserve
              <br />a place after the scroll.
            </h2>
          </div>
          <div className="explanation-copy">
            <p>
              Lore is a home for the context your community chooses to keep. A
              promise to follow up on. A decision your mods can explain. A story
              that makes a new viewer feel at home.
            </p>
            <p className="muted">
              We’re building it together, one chapter at a time. Channel and
              team setup are ready; memory workflows are coming next.
            </p>
          </div>
        </section>
        <section className="crew-section" id="your-crew">
          <div className="section-heading">
            <p className="eyebrow">ONE COMMUNITY. DIFFERENT SEATS.</p>
            <h2>There’s room for your whole crew.</h2>
          </div>
          <div className="crew-stories">
            <article className="crew-story lilac">
              <div className="crew-story-top">
                <Headphones size={24} />
                <span>01 / THE STREAMER</span>
              </div>
              <h3>
                Keep your word.
                <br />
                Keep your weird.
              </h3>
              <p>
                A place for the promises and loose ends worth coming back to.
              </p>
              <div className="crew-story-foot">
                <Avatar name="cozybyte" />
                <span>For the one behind the mic</span>
                <Bookmark size={19} />
              </div>
            </article>
            <article className="crew-story mint">
              <div className="crew-story-top">
                <ShieldCheck size={24} />
                <span>02 / THE MODS</span>
              </div>
              <h3>
                More context.
                <br />
                Less catching up.
              </h3>
              <p>
                Decisions with a history. Handoffs that don’t start from
                scratch.
              </p>
              <div className="crew-story-foot">
                <Avatar name="moss.jpeg" />
                <span>For the people holding it down</span>
                <Check size={19} />
              </div>
            </article>
            <article className="crew-story peach">
              <div className="crew-story-top">
                <span className="mini-faces">
                  <Avatar name="pixel" size={25} />
                  <Avatar name="juniper" size={25} />
                </span>
                <span>03 / THE COMMUNITY</span>
              </div>
              <h3>
                New here?
                <br />
                You’re part of it.
              </h3>
              <p>
                A catch-up on the approved stories, references, and moments that
                matter.
              </p>
              <div className="crew-story-foot">
                <Avatar name="new-friend" />
                <span>For the next familiar face</span>
                <ArrowUpRight size={19} />
              </div>
            </article>
          </div>
          <p className="section-footnote">
            A look at what’s ahead. Every public story will be reviewed by your
            channel’s team.
          </p>
        </section>
        <section className="closing-section">
          <div>
            <p className="eyebrow">NEXT STREAM, PICK UP WHERE YOU LEFT OFF.</p>
            <h2>
              Give your community
              <br />a little <span>lore.</span>
            </h2>
          </div>
          <div>
            <Link className="button primary" href="/login">
              <TwitchMark />
              Start with Twitch
              <ArrowRight size={19} />
            </Link>
            <Link className="quiet-link" href="/preview">
              Or explore the workspace preview
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <Brand />
        <span>Every stream has a story.</span>
        <span>Codex × TwitchCon Hackathon</span>
        <a
          href="https://github.com/Folareen/Lore"
          target="_blank"
          rel="noreferrer"
        >
          Built in the open
          <ArrowUpRight size={15} />
        </a>
      </footer>
    </div>
  );
}

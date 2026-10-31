'use client';
import Image from 'next/image';
import { useState } from 'react';
import { Check, CornerDownRight } from 'lucide-react';
import { Avatar } from './avatar';
const chapters = [
  {
    title: 'The promise',
    quote: '“Horror stream next Friday. No backing out.”',
    person: 'cozybyte',
    context: 'A very brave streamer',
    status: 'Confirmed promise',
    detail: 'One spooky stream. Zero forgotten plans.',
    color: 'coral',
  },
  {
    title: 'The follow-through',
    quote: '“Chat, I brought the heart-rate monitor.”',
    person: 'cozybyte',
    context: 'Friday has entered the chat',
    status: 'Promise fulfilled',
    detail: 'The receipts are part of the story.',
    color: 'mint',
  },
  {
    title: 'The lore',
    quote: '“Wait, why does everyone say check the closet?”',
    person: 'moss.jpeg',
    context: 'New here. Already one of us.',
    status: 'Approved community story',
    detail: 'A little context goes a long way.',
    color: 'lilac',
  },
];
export function LandingStory() {
  const [chapter, setChapter] = useState(0);
  const story = chapters[chapter];
  return (
    <section className="story-stage" aria-label="An illustrative Lore story">
      <div className="stage-top">
        <span className="eyebrow">A LITTLE LORE, FOR EXAMPLE</span>
        <span className="sample-label">Illustrative story</span>
      </div>
      <div className="stage-scene">
        <article className="memory-note" key={chapter}>
          <span className="tiny-label">IT STARTED IN CHAT</span>
          <blockquote>{story.quote}</blockquote>
          <div className="person">
            <Avatar name={story.person} size={36} />
            <div>
              <strong>{story.person}</strong>
              <small>{story.context}</small>
            </div>
          </div>
        </article>
        <div className="hero-illustration">
          <Image
            src="/illustrations/memory-party.png"
            alt="Three little community characters keeping colorful memories in a purple keepsake box"
            width="520"
            height="360"
            fetchPriority="high"
          />
        </div>
        <div className="story-receipt">
          <div className={`receipt-icon ${story.color}`}>
            <Check size={25} />
          </div>
          <span className="tiny-label">THE PART WE KEEP</span>
          <h3>{story.status}</h3>
          <p>{story.detail}</p>
          <CornerDownRight size={24} />
        </div>
      </div>
      <div className="chapter-nav" role="group" aria-label="Story chapters">
        {chapters.map((item, index) => (
          <button
            key={item.title}
            aria-pressed={chapter === index}
            onClick={() => setChapter(index)}
          >
            <span>0{index + 1}</span>
            {item.title}
            <span className="chapter-dot" />
          </button>
        ))}
      </div>
    </section>
  );
}

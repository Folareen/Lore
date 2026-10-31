'use client';
import { useState } from 'react';
import { Bookmark, Headphones, MessageCircle, RotateCcw } from 'lucide-react';
const pairs = [
  { name: 'The promise', icon: Bookmark },
  { name: 'The stream', icon: Headphones },
  { name: 'The chat', icon: MessageCircle },
];
const initialCards = [0, 1, 2, 1, 0, 2];
export function MemoryGame() {
  const [cards, setCards] = useState(initialCards),
    [started, setStarted] = useState(false),
    [open, setOpen] = useState<number[]>([]),
    [matched, setMatched] = useState<number[]>([]),
    [turns, setTurns] = useState(0),
    [message, setMessage] = useState('Six cards. Three pairs. No timer.');
  function reset() {
    const next = [...initialCards];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setCards(next);
    setOpen([]);
    setMatched([]);
    setTurns(0);
    setStarted(true);
    setMessage('Find your first pair.');
  }
  function reveal(index: number) {
    if (
      !started ||
      open.length === 2 ||
      open.includes(index) ||
      matched.includes(cards[index])
    )
      return;
    const next = [...open, index];
    setOpen(next);
    if (next.length === 2) {
      setTurns((value) => value + 1);
      if (cards[next[0]] === cards[next[1]]) {
        const found = [...matched, cards[index]];
        setMatched(found);
        setOpen([]);
        setMessage(
          found.length === 3
            ? 'Chat remembers. All three pairs found!'
            : `${pairs[cards[index]].name} — matched. ${found.length} of 3 pairs found.`,
        );
      } else
        setMessage(
          `${pairs[cards[next[0]]].name} and ${pairs[cards[next[1]]].name}. Not a pair — try again when you’re ready.`,
        );
    }
  }
  return (
    <section className="memory-game" aria-labelledby="memory-game-title">
      <div className="game-copy">
        <h2 id="memory-game-title">Good memory, chat?</h2>
        <p>
          Match the pairs while you’re here. Your channel setup can wait a
          minute.
        </p>
        <button className="button secondary" onClick={reset}>
          {started ? (
            <>
              <RotateCcw size={16} aria-hidden="true" />
              New round
            </>
          ) : (
            'Play a quick round'
          )}
        </button>
        {open.length === 2 && (
          <button
            className="button secondary"
            onClick={() => {
              setOpen([]);
              setMessage('Find your next pair.');
            }}
          >
            Try another pair
          </button>
        )}
        <p className="game-progress" role="status" aria-live="polite">
          {message}
          {started && (
            <span>
              {' '}
              {turns} {turns === 1 ? 'turn' : 'turns'}
            </span>
          )}
        </p>
      </div>
      <div className="memory-board" role="group" aria-label="Memory cards">
        {cards.map((pair, index) => {
          const face =
              started && (open.includes(index) || matched.includes(pair)),
            Icon = pairs[pair].icon;
          return (
            <button
              key={index}
              className={`memory-tile ${face ? 'face-up' : ''} ${matched.includes(pair) ? 'matched' : ''}`}
              disabled={!started || face || open.length === 2}
              aria-label={
                face
                  ? `${pairs[pair].name}${matched.includes(pair) ? ', matched' : ''}`
                  : `Turn card ${index + 1}`
              }
              onClick={() => reveal(index)}
            >
              <span className="tile-face" aria-hidden="true">
                {face ? (
                  <Icon size={30} />
                ) : (
                  <span className="tile-mark">
                    l<span>o</span>re
                  </span>
                )}
              </span>
              <small>{face ? pairs[pair].name : `0${index + 1}`}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

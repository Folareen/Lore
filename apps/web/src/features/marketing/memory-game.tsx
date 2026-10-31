'use client';
import { useState } from 'react';
import {
  Bookmark,
  Check,
  Eye,
  Headphones,
  MessageCircle,
  RotateCcw,
  Smile,
  Trophy,
} from 'lucide-react';
const pairs = [
  { name: 'The promise', icon: Bookmark, color: 'purple' },
  { name: 'The stream', icon: Headphones, color: 'green' },
  { name: 'The chat', icon: MessageCircle, color: 'peach' },
  { name: 'The emote', icon: Smile, color: 'yellow' },
];
const initialCards = [0, 1, 2, 3, 1, 0, 3, 2];
export function MemoryGame() {
  const [cards, setCards] = useState(initialCards);
  const [started, setStarted] = useState(false);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [turns, setTurns] = useState(0);
  const [peeking, setPeeking] = useState(false);
  const [usedPeek, setUsedPeek] = useState(false);
  const [best, setBest] = useState<number | null>(null);
  const [message, setMessage] = useState(
    'Eight cards. Four pairs. Take your time.',
  );
  const won = matched.length === pairs.length;
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
    setPeeking(false);
    setUsedPeek(false);
    setMessage('Pick two cards. Let’s see what chat remembers.');
  }
  function reveal(index: number) {
    if (
      !started ||
      peeking ||
      open.includes(index) ||
      matched.includes(cards[index])
    )
      return;
    const next = open.length === 2 ? [index] : [...open, index];
    setOpen(next);
    if (next.length === 1) {
      setMessage('Now find its other half.');
      return;
    }
    const moves = turns + 1;
    setTurns(moves);
    if (cards[next[0]] === cards[next[1]]) {
      const found = [...matched, cards[index]];
      setMatched(found);
      setOpen([]);
      if (found.length === pairs.length) {
        if (!usedPeek)
          setBest((previous) =>
            previous === null ? moves : Math.min(previous, moves),
          );
        setMessage(
          moves === pairs.length && !usedPeek
            ? 'Perfect round! All four pairs, first try.'
            : 'Chat remembers. All four pairs found!',
        );
      } else setMessage(`${pairs[cards[index]].name} — matched. Keep going!`);
    } else setMessage('Not a pair. Remember these, then turn another card.');
  }
  return (
    <section
      className={`memory-game ${won ? 'game-won' : ''}`}
      aria-labelledby="memory-game-title"
    >
      <div className="game-copy">
        <h2 id="memory-game-title">
          {won ? 'Chat has receipts.' : 'Good memory, chat?'}
        </h2>
        <p>
          {won
            ? `Four pairs found in ${turns} ${turns === 1 ? 'turn' : 'turns'}. Fancy another round?`
            : 'Flip two cards and find the matching pairs. Missed one? Turn another card and keep going.'}
        </p>
        <div className="game-actions">
          <button className="button primary" onClick={reset}>
            {started ? (
              <>
                <RotateCcw size={16} aria-hidden="true" /> New round
              </>
            ) : (
              'Play a quick round'
            )}
          </button>
          {started && !won && (!usedPeek || peeking) && (
            <button
              className="button secondary"
              onClick={() => {
                setPeeking((value) => !value);
                setUsedPeek(true);
                setOpen([]);
                setMessage(
                  peeking
                    ? 'Cards hidden. Find your next pair.'
                    : 'Have a look. Hide the cards when you’re ready.',
                );
              }}
            >
              <Eye size={16} aria-hidden="true" />
              {peeking ? 'Hide the cards' : 'Take a peek'}
            </button>
          )}
        </div>
        <p className="game-progress" role="status">
          {message}
        </p>
        {best !== null && (
          <p className="game-best">
            <Trophy size={16} aria-hidden="true" /> Your best this visit: {best}{' '}
            turns without a peek
          </p>
        )}
      </div>
      <div className="game-arena">
        <div className="game-score">
          <strong>
            {matched.length} / {pairs.length} pairs
          </strong>
          <span>
            {turns} {turns === 1 ? 'turn' : 'turns'}
          </span>
        </div>
        <div className="memory-board" role="group" aria-label="Memory cards">
          {cards.map((pair, index) => {
            const found = matched.includes(pair);
            const face = started && (peeking || open.includes(index) || found);
            const Icon = pairs[pair].icon;
            return (
              <button
                key={index}
                className={`memory-tile pair-${pairs[pair].color} ${face ? 'face-up' : ''} ${found ? 'matched' : ''}`}
                disabled={!started || face}
                aria-label={
                  face
                    ? `${pairs[pair].name}, card ${index + 1}${found ? ', matched' : ''}`
                    : `Turn card ${index + 1}`
                }
                onClick={() => reveal(index)}
              >
                <span className="tile-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="tile-face" aria-hidden="true">
                  {face ? <Icon size={30} /> : <MessageCircle size={30} />}
                </span>
                <small>
                  {face ? pairs[pair].name.replace('The ', '') : 'lore'}
                </small>
                {found && (
                  <Check
                    className="tile-matched"
                    size={14}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="game-collection" aria-hidden="true">
          {pairs.map((pair, index) => (
            <span
              key={pair.name}
              className={matched.includes(index) ? 'collected' : ''}
            >
              <pair.icon size={17} />
              {pair.name.replace('The ', '')}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

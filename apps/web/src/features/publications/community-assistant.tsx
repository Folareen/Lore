'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, MessageCircle, RotateCcw, X } from 'lucide-react';
import {
  communityAnswerSchema,
  communityAssistantStatusSchema,
  type CommunityAnswer,
  type PublicEntry,
} from '@lore/shared';
import { apiRequest } from '../../lib/api';
import { IconButton } from '../../components/icon-button';
const starters = [
  'What’s been happening lately?',
  'What do they do on stream?',
  'What are the community’s inside references?',
];
type Turn = { question: string; reply: CommunityAnswer };
export function CommunityAssistant({
  slug,
  name,
  demoSources,
}: {
  slug: string;
  name: string;
  demoSources?: PublicEntry[];
}) {
  const [enabled, setEnabled] = useState(Boolean(demoSources));
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const id = useId();
  const endpoint = `/public/channels/${encodeURIComponent(slug)}/assistant`;
  useEffect(() => {
    if (demoSources) return;
    const controller = new AbortController();
    const check = () =>
      void apiRequest(endpoint, communityAssistantStatusSchema, {
        signal: controller.signal,
      })
        .then((status) => {
          setEnabled(status.enabled);
          if (!status.enabled) {
            setOpen(false);
            setTurns([]);
            request.current?.abort();
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setEnabled(false);
            setOpen(false);
            setTurns([]);
            request.current?.abort();
          }
        });
    check();
    const timer = setInterval(check, 30_000);
    return () => {
      controller.abort();
      request.current?.abort();
      clearInterval(timer);
    };
  }, [endpoint, demoSources]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (open && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, pending, turns, error]);
  function close() {
    request.current?.abort();
    request.current = null;
    setPending('');
    setOpen(false);
    trigger.current?.focus();
  }
  async function ask(value = question) {
    const text = value.trim();
    if (text.length < 2 || pending) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25_000);
    setPending(text);
    setError('');
    setQuestion(text);
    try {
      let reply: CommunityAnswer;
      if (demoSources) {
        const words = text
          .toLowerCase()
          .split(/\W+/)
          .filter(
            (word) =>
              word.length > 3 &&
              ![
                'what',
                'they',
                'their',
                'does',
                'about',
                'with',
                'from',
                'have',
                'this',
                'that',
              ].includes(word),
          );
        const source = demoSources
          .map((item) => ({
            item,
            score:
              words.reduce(
                (score, word) =>
                  score +
                  (item.title.toLowerCase().includes(word) ? 3 : 0) +
                  (item.body.toLowerCase().includes(word) ? 1 : 0),
                0,
              ) +
              (/inside|reference|joke/i.test(text) && item.kind === 'reference'
                ? 2
                : 0) +
              (/recent|lately|happening|catch.*up/i.test(text) &&
              item.kind === 'summary'
                ? 2
                : 0),
          }))
          .filter((match) => match.score > 0)
          .sort((a, b) => b.score - a.score)[0]?.item;
        reply = source
          ? {
              answer: source.body.slice(0, 800),
              sources: [{ id: source.id, title: source.title }],
              grounded: true,
            }
          : {
              answer:
                'The sample stories don’t cover that yet. Try asking about the garden tour, or explore the published stories.',
              sources: [],
              grounded: false,
            };
      } else {
        reply = await apiRequest(endpoint, communityAnswerSchema, {
          method: 'POST',
          body: {
            question: text,
            previousQuestions: turns.slice(-2).map((turn) => turn.question),
          },
          signal: controller.signal,
        });
      }
      if (!controller.signal.aborted) {
        setTurns((turns) => [...turns.slice(-7), { question: text, reply }]);
        setQuestion('');
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : 'Please try again.');
      else if (request.current === controller && open)
        setError('That took too long. Please try again.');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        setPending('');
        request.current = null;
      }
    }
  }
  if (!enabled) return null;
  return (
    <div className="community-assistant">
      <button
        ref={trigger}
        type="button"
        className="button primary assistant-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <MessageCircle size={20} aria-hidden="true" /> Ask about the community
      </button>
      {open && (
        <section
          id={id}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${id}-title`}
          className="assistant-panel"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
        >
          <header className="assistant-heading">
            <div>
              <h2 id={`${id}-title`}>Ask about {name}</h2>
              <p>
                {demoSources
                  ? 'Demo · sample stories only'
                  : 'AI guide · published stories only'}
              </p>
            </div>
            <IconButton
              label="Clear conversation"
              disabled={Boolean(pending) || !turns.length}
              onClick={() => {
                setTurns([]);
                setError('');
                input.current?.focus();
              }}
            >
              <RotateCcw size={17} />
            </IconButton>
            <IconButton label="Close community chat" onClick={close}>
              <X size={19} />
            </IconButton>
          </header>
          <div
            className="assistant-log"
            ref={log}
            role="log"
            aria-label="Community conversation"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {!turns.length && !pending && (
              <div className="assistant-welcome">
                <MessageCircle size={26} aria-hidden="true" />
                <h3>A little context goes a long way.</h3>
                <p>
                  Ask about the streams, the stories or a reference you’ve seen
                  in chat.
                </p>
                <div className="assistant-starters">
                  {starters.map((text) => (
                    <button
                      type="button"
                      key={text}
                      onClick={() => void ask(text)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn, index) => (
              <div className="assistant-turn" key={index}>
                <p className="assistant-question">
                  <span className="sr-only">You: </span>
                  {turn.question}
                </p>
                <div className="assistant-answer">
                  <span className="sr-only">Community guide: </span>
                  <p>{turn.reply.answer}</p>
                  {turn.reply.sources.length > 0 && (
                    <nav aria-label="Answer sources">
                      <span>From the community</span>
                      {turn.reply.sources.map((source) => (
                        <Link
                          key={source.id}
                          href={
                            demoSources
                              ? `/demo?view=community&entry=${encodeURIComponent(source.id)}`
                              : `/c/${encodeURIComponent(slug)}/entries/${source.id}`
                          }
                          prefetch={false}
                        >
                          {source.title}
                        </Link>
                      ))}
                    </nav>
                  )}
                </div>
              </div>
            ))}
            {pending && (
              <>
                <p className="assistant-question">{pending}</p>
                <p role="status">Reading the public stories…</p>
              </>
            )}
            {error && (
              <p role="alert" className="notice error">
                {error} Your question is still below.
              </p>
            )}
          </div>
          <form
            className="assistant-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            <label htmlFor={`${id}-question`} className="sr-only">
              Your community question
            </label>
            <textarea
              ref={input}
              id={`${id}-question`}
              rows={2}
              maxLength={500}
              value={question}
              disabled={Boolean(pending)}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask a question…"
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void ask();
                }
              }}
            />
            <button
              className="button primary"
              aria-label="Send question"
              disabled={Boolean(pending) || question.trim().length < 2}
            >
              <ArrowUp size={20} />
            </button>
            <p>
              {demoSources
                ? 'Simulated answers. No question is sent to Gemini.'
                : 'Questions go to Gemini. Avoid personal information. AI can be wrong; check the sources. Google may use free-tier inputs to improve its products.'}
            </p>
          </form>
        </section>
      )}
    </div>
  );
}

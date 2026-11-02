import Link from 'next/link';
import { guides, type GuideView, type GuideAudience } from './guides';
export function GuideContent({
  audience,
  href,
}: {
  audience: GuideAudience;
  href: (view: GuideView) => string;
}) {
  const guide = guides[audience];
  return (
    <article className="help-article">
      <header>
        <h2>{guide.title}</h2>
        <p className="muted">{guide.description}</p>
      </header>
      <nav className="help-topics" aria-label={`${guide.label} topics`}>
        {guide.steps.map((step) => (
          <a key={step.id} href={`#${step.id}`}>
            {step.title}
          </a>
        ))}
      </nav>
      <ol className="help-steps">
        {guide.steps.map((step) => (
          <li key={step.id} id={step.id}>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            <details>
              <summary>Details & troubleshooting</summary>
              <p>{step.detail}</p>
            </details>
            <Link className="text-link" href={href(step.view)}>
              {step.action} →
            </Link>
          </li>
        ))}
      </ol>
      <section className="help-questions">
        <h3>Common questions</h3>
        {guide.questions.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </section>
    </article>
  );
}

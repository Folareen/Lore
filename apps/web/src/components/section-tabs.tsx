'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Keeps drafts mounted while switching between related tasks. */
export function SectionTabs({
  label,
  value,
  onValueChange,
  tabs,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  tabs: { value: string; label: string; content: ReactNode }[];
}) {
  const id = useId();
  const [visited, setVisited] = useState(() => new Set([value]));
  useEffect(() => {
    setVisited((current) =>
      current.has(value) ? current : new Set([...current, value]),
    );
  }, [value]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="section-tabs">
      <div className="section-tab-list" role="tablist" aria-label={label}>
        {tabs.map((tab, index) => (
          <button
            key={tab.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            id={`${id}-tab-${tab.value}`}
            type="button"
            role="tab"
            aria-selected={value === tab.value}
            aria-controls={`${id}-panel-${tab.value}`}
            tabIndex={value === tab.value ? 0 : -1}
            onClick={() => onValueChange(tab.value)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
              else if (event.key === 'ArrowLeft')
                next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = tabs.length - 1;
              else return;
              event.preventDefault();
              buttons.current[next]?.focus();
              onValueChange(tabs[next].value);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.value}
          role="tabpanel"
          id={`${id}-panel-${tab.value}`}
          aria-labelledby={`${id}-tab-${tab.value}`}
          hidden={value !== tab.value}
          tabIndex={0}
        >
          {(value === tab.value || visited.has(tab.value)) && tab.content}
        </div>
      ))}
    </div>
  );
}

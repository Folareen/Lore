'use client';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      className="icon-button theme-toggle"
      aria-label="Toggle light and dark mode"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="sun-icon" size={19} />
      <Moon className="moon-icon" size={19} />
    </button>
  );
}
export function ThemeChoices() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="theme-choices" role="group" aria-label="Color theme">
      {(
        [
          { value: 'light', label: 'Light', icon: Sun },
          { value: 'dark', label: 'Dark', icon: Moon },
          { value: 'system', label: 'System', icon: Monitor },
        ] as const
      ).map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className="theme-option"
          aria-pressed={mounted && theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon size={21} />
          {label}
        </button>
      ))}
    </div>
  );
}

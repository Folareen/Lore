'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import type { Session } from '@lore/shared';
import { Brand } from '../../components/brand';
import { Avatar } from '../../components/avatar';

export function MobileNavigation({
  children,
  secondary,
  secondaryActive = false,
  user,
  preview,
}: {
  children: ReactNode;
  secondary?: ReactNode;
  secondaryActive?: boolean;
  user: Session['user'];
  preview: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    const desktop = window.matchMedia('(min-width: 851px)');
    const resized = () => {
      if (desktop.matches) dialog.current?.close();
    };
    desktop.addEventListener('change', resized);
    return () => {
      root.style.overflow = previous;
      desktop.removeEventListener('change', resized);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        className="button secondary mobile-nav-toggle"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <Menu size={21} aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        id={id}
        className="mobile-nav-dialog"
        aria-label="Community menu"
        onClose={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const targets = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), summary',
            ),
          ).filter((element) => element.getClientRects().length > 0);
          const first = targets[0];
          const last = targets[targets.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close();
        }}
      >
        <div className="mobile-nav-dialog-header">
          <Brand />
          <button
            className="icon-button"
            aria-label="Close navigation"
            onClick={close}
            autoFocus
          >
            <X size={21} aria-hidden="true" />
          </button>
        </div>
        <nav
          aria-label="Community navigation"
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('a'))
              close();
          }}
        >
          {children}
          {secondary && (
            <details
              className="mobile-secondary-nav"
              open={secondaryActive || undefined}
            >
              <summary>More tools &amp; settings</summary>
              {secondary}
            </details>
          )}
        </nav>
        <div className="mobile-nav-account">
          <Avatar name={user.login} size={36} />
          <div>
            <strong>{user.displayName}</strong>
            <small>{preview ? 'Demo fixture' : `@${user.login}`}</small>
          </div>
        </div>
      </dialog>
    </>
  );
}

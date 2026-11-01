'use client';
import { useEffect, useRef } from 'react';
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busy: boolean;
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <div className="muted">{children}</div>
      <div className="button-row">
        <button
          className="button secondary"
          disabled={busy}
          onClick={onCancel}
          autoFocus
        >
          Cancel
        </button>
        <button
          className={`button ${tone}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

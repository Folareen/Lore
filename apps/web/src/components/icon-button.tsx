'use client';
import { useId, type ComponentProps } from 'react';
/** Reserve icon-only actions for familiar secondary controls. */
export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ComponentProps<'button'> & { label: string }) {
  const id = useId();
  return (
    <span className="icon-action-wrap">
      <button
        type="button"
        {...props}
        className={`button secondary icon-action ${className}`}
        aria-label={label}
        aria-describedby={id}
      >
        {children}
      </button>
      <span className="icon-action-tooltip" id={id} role="tooltip">
        {label}
      </span>
    </span>
  );
}

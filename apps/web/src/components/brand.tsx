import Link from 'next/link';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="Lore home">
      <svg
        width="32"
        height="35"
        viewBox="0 0 32 35"
        fill="none"
        aria-hidden="true"
      >
        <path d="M4 3h10v19h14v10H4V3Z" fill="currentColor" />
        <path d="M20 3h8v10h-8z" fill="#9146FF" />
      </svg>
      {!compact && <span>lore</span>}
    </Link>
  );
}
export function TwitchMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 2 2 6v15h5v3l3-3h4l7-7V2H4Zm15 11-4 4h-4l-3 3v-3H5V4h14v9ZM10 7v6h2V7h-2Zm5 0v6h2V7h-2Z" />
    </svg>
  );
}

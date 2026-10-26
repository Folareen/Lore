const palettes = [
  ['#DAC8F7', '#6336B6'],
  ['#F4C1AF', '#9E493A'],
  ['#C4D9CA', '#496D54'],
  ['#E8D796', '#816827'],
];
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const seed = [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const [background, foreground] = palettes[seed % palettes.length];
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background, color: foreground }}
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <path
          d={
            seed % 2
              ? 'M8 38V24C8 12 15 8 24 8s16 4 16 16v14l-8-4-8 4-8-4-8 4Z'
              : 'M7 26c0-11 7-17 17-17s17 6 17 17-7 15-17 15S7 37 7 26Z'
          }
          fill="currentColor"
        />
        <ellipse cx="19" cy="24" rx="2" ry="3" fill={background} />
        <ellipse cx="29" cy="24" rx="2" ry="3" fill={background} />
        <path
          d="M21 32q3 2 6 0"
          stroke={background}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

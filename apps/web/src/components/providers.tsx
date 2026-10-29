'use client';
import { ThemeProvider } from 'next-themes';
export function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  return (
    <ThemeProvider
      nonce={nonce}
      attribute="data-theme"
      storageKey="lore-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}

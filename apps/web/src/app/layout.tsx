import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/space-grotesk';
import './globals.css';
import { Providers } from '../components/providers';
export const metadata: Metadata = {
  title: {
    default: 'Lore — The stream ends. The lore doesn’t.',
    template: '%s · Lore',
  },
  description:
    'A shared memory for your Twitch community. Keep the promises, context, and stories worth carrying into the next stream.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          {children}
        </Providers>
      </body>
    </html>
  );
}

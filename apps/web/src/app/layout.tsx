import type { Metadata } from 'next';
import { headers } from 'next/headers';
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
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <Providers nonce={nonce}>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          {children}
        </Providers>
      </body>
    </html>
  );
}

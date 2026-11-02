import type { NextConfig } from 'next';
import { loadEnvConfig } from '@next/env';
import path from 'node:path';
loadEnvConfig(path.resolve(process.cwd(), '../..'));
const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  distDir: process.env.LORE_E2E_BUILD === '1' ? '.next-e2e' : '.next',
  poweredByHeader: false,
  transpilePackages: ['@lore/shared'],
  async redirects() {
    return [{ source: '/preview', destination: '/demo', permanent: true }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(), payment=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          ...(process.env.APP_ORIGIN?.startsWith('https://')
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
            : []),
        ],
      },
      {
        source: '/overlay/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/api/:path*`,
      },
    ];
  },
};
export default nextConfig;

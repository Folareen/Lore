import type { NextConfig } from 'next';
import { loadEnvConfig } from '@next/env';
import path from 'node:path';
loadEnvConfig(path.resolve(process.cwd(), '../..'));
const nextConfig: NextConfig = {
  transpilePackages: ['@lore/shared'],
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

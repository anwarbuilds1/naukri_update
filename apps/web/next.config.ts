import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PWA configuration is handled by next-pwa or manual service worker
  // Phase 1: basic config only
  experimental: {
    // React 19 support
  },
};

export default nextConfig;

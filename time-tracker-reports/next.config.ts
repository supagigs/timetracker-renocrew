import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'supabase.co',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      }
    ],
    unoptimized: false, // Keep optimization but allow per-image unoptimized
  },
};

export default nextConfig;

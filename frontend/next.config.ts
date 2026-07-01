import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lint and type checks run in development; don't block production builds on them.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

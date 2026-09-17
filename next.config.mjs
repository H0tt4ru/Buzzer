/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Student pages are pure client state machines; no server rendering of game data.
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;

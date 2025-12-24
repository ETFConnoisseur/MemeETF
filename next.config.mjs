/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use webpack explicitly for compatibility
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
  // Empty turbopack config to silence the warning
  turbopack: {},
  async rewrites() {
    return [
      {
        source: '/vite-build/:path*',
        destination: '/vite-build/:path*',
      },
    ];
  },
};

export default nextConfig;




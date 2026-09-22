/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    // Crop photos can come from Wikimedia/Wikipedia in existing records.
    // Keep the allow-list broad enough for the real image URLs returned by
    // Wikimedia (including language-specific Wikipedia hosts and redirects),
    // otherwise Next.js returns HTTP 400 from /_next/image in production.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "commons.wikimedia.org",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.wikipedia.org",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.wikimedia.org",
        pathname: "/**",
      },
    ],
  },
  // Only pulls in the icon components actually used on each page instead of
  // bundling the whole lucide-react library into every route's JS chunk.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

module.exports = nextConfig;
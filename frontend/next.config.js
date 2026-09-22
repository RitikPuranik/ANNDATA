/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    // Serve images directly instead of routing remote images through
    // /_next/image. This avoids production 400s from remote image URLs
    // that redirect (for example Wikimedia Special:FilePath URLs).
    unoptimized: true,
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
        hostname: "images.unsplash.com",
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

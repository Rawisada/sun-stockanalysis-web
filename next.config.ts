import type { NextConfig } from "next";

const apiProxyBaseUrl = process.env.API_PROXY_BASE_URL;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

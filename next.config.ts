import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        os: false,
        http: false,
        https: false,
        zlib: false,
      };
    }
    return config;
  },
};

export default nextConfig;

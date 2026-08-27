import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default 1MB is too small for importing a real notes vault as a
    // single zip upload -- raised to a generous personal-scale value.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

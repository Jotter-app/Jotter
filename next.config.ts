import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default 1MB is too small for importing a real notes vault as a
    // single zip upload. A vault with images/audio/video attachments
    // (silently skipped on import, but still uploaded as part of the zip)
    // can easily reach tens of MB -- 100mb leaves real headroom for that.
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // proxy.ts runs in front of every request, including this Server
    // Action's POST -- it enforces its own separate 10MB default (see
    // node_modules/next/dist/docs/.../codemods.md, "middleware-to-proxy":
    // experimental.middlewareClientMaxBodySize was renamed to
    // proxyClientMaxBodySize). Raising serverActions.bodySizeLimit alone
    // doesn't help if this cap truncates the body first.
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;

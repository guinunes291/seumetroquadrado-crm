import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // O lint do repositório (eslint.config.js na raiz) é do CRM; este app não usa.
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["postgres"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default config;

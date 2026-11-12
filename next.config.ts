import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The Fleet section (FleetHub devices/patches/reports + ControlR remote
  // access) was retired 2026-11-08 when FleetHub and ControlR were archived in
  // favour of Breeze RMM. Old bookmarks land on Home instead of a 404.
  async redirects() {
    return [
      { source: "/fleet", destination: "/", permanent: false },
      { source: "/fleet/:path*", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;

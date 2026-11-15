import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship precomputed research snapshots with the API function.
  outputFileTracingIncludes: { "/api/research": ["./data/research/**/*"] },
};

export default nextConfig;

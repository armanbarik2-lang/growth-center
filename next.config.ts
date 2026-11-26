import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the setup route reads the schema and seed files at runtime
  outputFileTracingIncludes: {
    "/api/setup": ["./data/*.json", "./db/*.sql"],
  },
};

export default nextConfig;

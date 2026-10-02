import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["glpk.js", "xlsx"],
};

export default nextConfig;

import type { NextConfig } from "next";
import { resolve } from "path";
import { fileURLToPath } from "url";

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(fileURLToPath(import.meta.url), ".."),
  },
};

export default nextConfig;

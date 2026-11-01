import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit", "pg"],
  outputFileTracingIncludes: {
    "/api/telegram/files": ["./src/lib/telegram/fonts/*.ttf"],
  },
};

export default nextConfig;

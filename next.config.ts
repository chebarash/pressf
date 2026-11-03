import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit", "pdfjs-dist", "pg"],
  outputFileTracingIncludes: {
    "/api/telegram/files": ["./src/lib/telegram/fonts/*.ttf", "./src/server/covers/assets/*"],
    "/og/[...slug]": ["./src/server/covers/assets/*"],
  },
};

export default nextConfig;

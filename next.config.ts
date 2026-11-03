import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client cache for visited pages and for links prefetched in full (sidebar,
    // course list): switching back to a section within these windows is instant,
    // with no loading screen. Mutations still refresh through server actions.
    staleTimes: { dynamic: 60, static: 300 },
  },
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit", "pdfjs-dist", "pg"],
  outputFileTracingIncludes: {
    "/api/telegram/files": ["./src/lib/telegram/fonts/*.ttf", "./src/server/covers/assets/*"],
    "/og/[...slug]": ["./src/server/covers/assets/*"],
    // Routes that brand files (the cover reads these fonts and the mascot at run time).
    "/f/[id]/download": ["./src/server/covers/assets/*"],
    "/api/telegram/send-file": ["./src/server/covers/assets/*"],  },
};

export default nextConfig;

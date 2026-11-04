import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client cache for visited pages and for links prefetched in full (sidebar,
    // course list): switching back to a section within these windows is instant,
    // with no loading screen. Mutations still refresh through server actions.
    staleTimes: { dynamic: 60, static: 300 },
  },
  // Calendar was merged into Timetable: its month view. The query (?layers=…) is kept.
  async redirects() {
    return [{ source: "/calendar", destination: "/timetable?view=month", permanent: false }];
  },
  // "From a photo" in the admin face constructor runs MediaPipe in the browser
  // from public/mediapipe (same origin, nothing from a CDN). The site sends no
  // CSP; if one is added it must allow 'self' scripts and fetches plus
  // 'wasm-unsafe-eval' for these files. The wasm and models are ~18 MB: cache them.
  async headers() {
    return [
      {
        source: "/mediapipe/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit", "pdfjs-dist", "pg"],
  outputFileTracingIncludes: {
    "/api/telegram/files": ["./src/lib/telegram/fonts/*.ttf", "./src/server/covers/assets/*"],
    "/og/[...slug]": ["./src/server/covers/assets/*"],
    // Routes that brand files (the cover reads these fonts and the mascot at run time).
    "/f/[id]/download": ["./src/server/covers/assets/*"],
    "/f/[id]/raw": ["./src/server/covers/assets/*"],
    "/api/telegram/send-file": ["./src/server/covers/assets/*"],  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "l4l8qr8nf6lc97wt.public.blob.vercel-storage.com",
        port: "",
      },
    ],
  },
};

export default nextConfig;

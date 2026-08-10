import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "hvawfylsdaormrkghbbw.supabase.co",
        pathname: "/storage/v1/object/sign/products/**",
      },
    ],
  },
};

export default nextConfig;

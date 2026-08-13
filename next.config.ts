import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "hvawfylsdaormrkghbbw.supabase.co",
        pathname: "/storage/v1/object/sign/products/**",
      },
      {
        protocol: "https",
        hostname: "www.deigon.co.za",
        pathname: "/cdn/shop/files/**",
      },
    ],
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // Ensure the service worker updates when the app changes
  register: true,
});

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {},
};

export default withPWA(nextConfig);

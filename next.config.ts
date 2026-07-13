import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ioredis", "minio", "@prisma/adapter-pg"],
};

export default nextConfig;

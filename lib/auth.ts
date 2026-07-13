import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";

/**
 * better-auth server instance. Mounted at app/api/auth/[...all]/route.ts.
 *
 * Session lookups are backed by Redis (secondaryStorage) so proxy.ts can
 * check auth on every request without hitting Postgres.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secondaryStorage: {
    get: (key) => redis.get(key),
    set: (key, value, ttl) =>
      ttl ? redis.set(key, value, "EX", ttl).then(() => undefined) : redis.set(key, value).then(() => undefined),
    delete: (key) => redis.del(key).then(() => undefined),
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  socialProviders: {
    ...(env.GITHUB_CLIENT_ID
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET!,
          },
        }
      : {}),
    ...(env.GOOGLE_CLIENT_ID
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {}),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min cookie cache to skip a Redis round trip
    },
  },
  // Keeps server actions/route handlers able to set the session cookie.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

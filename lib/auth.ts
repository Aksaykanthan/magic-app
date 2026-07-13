import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
// MAGIC:username:start
import { username } from "better-auth/plugins";
// MAGIC:username:end
// MAGIC:captcha:start
import { captcha } from "better-auth/plugins";
// MAGIC:captcha:end
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
// MAGIC:mailer:start
import { sendMail } from "@/lib/mailer";
// MAGIC:mailer:end

/**
 * better-auth server instance. Mounted at app/api/auth/[...all]/route.ts.
 *
 * Session lookups are backed by Redis (secondaryStorage) so proxy.ts can
 * check auth on every request without hitting Postgres. Rate limiting is on
 * by default (see `rateLimit` below) — better-auth ships this built in, no
 * extra plugin needed.
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
  // Applies to every auth endpoint (sign-in, sign-up, forget-password, ...).
  // 100 requests / 60s per IP is a reasonable default for a small app —
  // tighten `customRules` for specific paths (e.g. sign-in) if you're seeing
  // credential-stuffing traffic. Uses Redis (shared across server instances)
  // when the `redis` module is kept, otherwise falls back to in-memory
  // (per-instance, resets on restart — fine for a single-instance deploy).
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "secondary-storage",
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    // MAGIC:mailer:start
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Reset your password",
        html: `<p>Someone requested a password reset for this account.</p><p><a href="${url}">Reset your password</a></p><p>If this wasn't you, you can safely ignore this email.</p>`,
      });
    },
    // MAGIC:mailer:end
  },
  // MAGIC:mailer:start
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Verify your email address",
        html: `<p>Click the link below to verify your email address.</p><p><a href="${url}">Verify email</a></p>`,
      });
    },
  },
  // MAGIC:mailer:end
  socialProviders: {
    ...(env.GITHUB_CLIENT_ID
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET!,
          },
        }
      : {}),
    // MAGIC:google:start
    ...(env.GOOGLE_CLIENT_ID
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {}),
    // MAGIC:google:end
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min cookie cache to skip a Redis round trip
    },
  },
  plugins: [
    // MAGIC:username:start
    // Lets users sign in with a username instead of (or in addition to)
    // email — requires emailAndPassword.enabled, which is always on above.
    username(),
    // MAGIC:username:end
    // MAGIC:captcha:start
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: env.TURNSTILE_SECRET_KEY!,
    }),
    // MAGIC:captcha:end
    // Keeps server actions/route handlers able to set the session cookie —
    // must stay last in this array (better-auth requirement).
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

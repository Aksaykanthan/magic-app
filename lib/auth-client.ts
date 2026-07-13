import { createAuthClient } from "better-auth/react";
import { env } from "@/lib/env";

/**
 * Client-side better-auth instance for use in Client Components
 * (`"use client"`). Server Components/Route Handlers should call
 * `auth.api.*` from `@/lib/auth` directly instead.
 */
export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_APP_URL,
});

export const { signIn, signUp, signOut, useSession } = authClient;

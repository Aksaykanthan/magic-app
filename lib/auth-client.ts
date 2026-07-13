import { createAuthClient } from "better-auth/react";
// MAGIC:username:start
import { usernameClient } from "better-auth/client/plugins";
// MAGIC:username:end
import { env } from "@/lib/env";

/**
 * Client-side better-auth instance for use in Client Components
 * (`"use client"`). Server Components/Route Handlers should call
 * `auth.api.*` from `@/lib/auth` directly instead.
 */
export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  plugins: [
    // MAGIC:username:start
    usernameClient(),
    // MAGIC:username:end
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;

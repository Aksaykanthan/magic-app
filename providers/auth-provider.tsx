"use client";

/**
 * Session context — wraps better-auth's `authClient.useSession()` in a
 * React context so multiple components reading the session in the same
 * render tree share one subscription instead of each calling the hook (and
 * each firing its own `/api/auth/get-session` request) independently.
 *
 * Deleted automatically by `bun run setup` when the `auth` module is
 * dropped (see AUTH_PATHS in scripts/setup.ts), which also surgically
 * unwraps `<AuthProvider>` out of providers/index.tsx.
 */
import { createContext, useContext, useMemo } from "react";
import { authClient, useSession } from "@/lib/auth-client";

type SessionData = ReturnType<typeof useSession>["data"];

interface AuthContextValue {
  session: SessionData;
  isPending: boolean;
  /** Re-fetches the session (e.g. after updating the user's profile). */
  refetch: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending, refetch } = useSession();

  const value = useMemo<AuthContextValue>(
    () => ({ session: data, isPending, refetch }),
    [data, isPending, refetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Read the current session anywhere under `<AuthProvider>` (mounted in
 * providers/index.tsx, so anywhere in the app). For imperative calls
 * (sign in/out, etc.) import `authClient`/`signIn`/`signOut` from
 * `@/lib/auth-client` directly instead — this hook is read-only.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}

export { authClient };

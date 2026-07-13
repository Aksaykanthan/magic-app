/**
 * Barrel re-export so every provider has a consistent `@/providers/*` import
 * path. The actual implementation lives in `lib/trpc/client.tsx` because
 * it's tightly coupled to the rest of `lib/trpc/**` (query client, AppRouter
 * type, etc.) — moving the code itself here would just add an import hop
 * with no benefit.
 *
 * Deleted automatically by `bun run setup` when the `trpc` module is
 * dropped (see TRPC_PATHS in scripts/setup.ts), which also surgically
 * unwraps `<TRPCProvider>` out of providers/index.tsx so nothing keeps
 * importing this file.
 */
export { TRPCReactProvider as TRPCProvider } from "@/lib/trpc/client";

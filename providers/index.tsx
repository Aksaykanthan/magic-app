"use client";

/**
 * Single composition root for every context provider in the app. Mounted
 * once in `app/layout.tsx` as `<AppProviders>{children}</AppProviders>`
 * instead of hand-nesting each provider there, so the root layout stays
 * readable as new providers get added.
 *
 * ORDER MATTERS: ColorThemeProvider/ThemeProvider need to be outermost so
 * their attributes land on <html>/<body> before anything below tries to
 * read a theme; TooltipProvider is innermost since it's pure UI state with
 * no dependency on the others.
 *
 * `bun run setup` surgically unwraps `<TRPCProvider>` / `<AuthProvider>`
 * from this file (regex-matched by exact tag name — don't add props to
 * these two specific wrapper tags, or add unrelated JSX between the
 * `<XProvider>` open tag and its children, or the surgical edit in
 * scripts/setup.ts's `unwrapJsxWrapper` will silently no-op instead of
 * cleaning up) when you drop the `trpc`/`auth` module, so the file keeps
 * compiling without dangling imports.
 */
import type { ReactNode } from "react";
import { ThemeProvider } from "@/providers/theme-provider";
import { ColorThemeProvider } from "@/providers/color-theme-provider";
import { TRPCProvider } from "@/providers/trpc-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ColorThemeProvider>
        <TRPCProvider>
          <AuthProvider>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </TRPCProvider>
      </ColorThemeProvider>
    </ThemeProvider>
  );
}

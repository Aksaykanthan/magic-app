"use client";

/**
 * Light/dark/system mode — thin wrapper around next-themes.
 *
 * Separate from `ColorThemeProvider` (providers/color-theme-provider.tsx):
 * this one toggles the `.dark` class (next-themes' `class` strategy), the
 * other sets a `data-theme="<preset>"` attribute for the accent color. They
 * compose independently — see providers/index.tsx.
 */
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";
import { DEFAULT_THEME_MODE } from "@/lib/themes";

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME_MODE}
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

// Re-exported so consumers only need one import for both "which mode am I
// in" (this) and "which color am I in" (useColorTheme, same barrel).
export { useTheme } from "next-themes";

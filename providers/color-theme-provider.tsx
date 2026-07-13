"use client";

/**
 * Color preset (accent color) — independent of light/dark mode.
 *
 * Sets `data-theme="<preset id>"` on `<html>`, persisted to localStorage
 * under `COLOR_THEME_STORAGE_KEY`. The actual colors live in
 * `app/globals.css` as `[data-theme="<id>"]` blocks (see lib/themes.ts for
 * how to add a preset).
 *
 * FLASH-OF-WRONG-THEME: the stored preference only exists in localStorage,
 * which isn't available during SSR/the initial HTML paint. We inline a tiny
 * synchronous <script> (via `dangerouslySetInnerHTML`, same trick
 * next-themes itself uses) that runs before React hydrates and sets the
 * attribute immediately — so the first paint already has the right color
 * instead of flashing the default and then swapping.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { COLOR_THEMES, DEFAULT_COLOR_THEME, isColorThemeId, type ColorThemeId } from "@/lib/themes";

export const COLOR_THEME_STORAGE_KEY = "color-theme";
const ATTRIBUTE = "data-theme";

interface ColorThemeContextValue {
  theme: ColorThemeId;
  setTheme: (id: ColorThemeId) => void;
}

const ColorThemeContext = createContext<ColorThemeContextValue | null>(null);

function applyThemeAttribute(id: string): void {
  document.documentElement.setAttribute(ATTRIBUTE, id);
}

/** Blocking inline script — must stay inline (no external file) to run before first paint. */
function NoFlashScript({ storageKey, fallback }: { storageKey: string; fallback: string }) {
  const script = `(function(){try{var t=localStorage.getItem(${JSON.stringify(storageKey)})||${JSON.stringify(fallback)};document.documentElement.setAttribute(${JSON.stringify(ATTRIBUTE)},t);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export function ColorThemeProvider({
  children,
  defaultTheme = DEFAULT_COLOR_THEME,
}: {
  children: React.ReactNode;
  defaultTheme?: string;
}) {
  const initialTheme = isColorThemeId(defaultTheme) ? defaultTheme : DEFAULT_COLOR_THEME;
  // Lazy initializer (not an effect) reads whatever the no-flash script
  // already applied, so React's first client render matches the DOM
  // instead of committing the SSR default and then re-rendering.
  const [theme, setThemeState] = useState<ColorThemeId>(() => {
    if (typeof window === "undefined") return initialTheme;
    const stored = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    return stored && isColorThemeId(stored) ? stored : initialTheme;
  });

  useEffect(() => {
    applyThemeAttribute(theme);
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<ColorThemeContextValue>(
    () => ({
      theme,
      setTheme: (id) => setThemeState(id),
    }),
    [theme],
  );

  return (
    <ColorThemeContext.Provider value={value}>
      <NoFlashScript storageKey={COLOR_THEME_STORAGE_KEY} fallback={initialTheme} />
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme(): ColorThemeContextValue {
  const ctx = useContext(ColorThemeContext);
  if (!ctx) {
    throw new Error("useColorTheme must be used within <ColorThemeProvider>");
  }
  return ctx;
}

export { COLOR_THEMES };

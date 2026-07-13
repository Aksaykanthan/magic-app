/**
 * Theme preset metadata — the single source of truth for:
 *  - `components/theme-switcher.tsx` (renders one menu item per color
 *    preset, using `swatch` for the little color dot, and one per mode),
 *  - `providers/color-theme-provider.tsx` / `providers/theme-provider.tsx`
 *    (validate a stored/selected id against these lists before applying),
 *  - `scripts/setup.ts` (prompts "which theme?" / "which default mode?" at
 *    install time using these same ids/labels, then regex-replaces
 *    `DEFAULT_COLOR_THEME` / `DEFAULT_THEME_MODE` below with the choice).
 *
 * The actual CSS for each color preset lives in `app/globals.css` under
 * `[data-theme="<id>"]` / `.dark[data-theme="<id>"]` blocks. Add a preset by:
 *   1. adding a `[data-theme="foo"]` + `.dark[data-theme="foo"]` block in
 *      globals.css (override --primary/--ring/--sidebar-primary*),
 *   2. adding one entry to `COLOR_THEMES` below with a matching `id`.
 */
export interface ColorTheme {
  id: string;
  label: string;
  /** CSS color used for the little preview dot in the theme switcher. */
  swatch: string;
}

export const COLOR_THEMES: ColorTheme[] = [
  { id: "zinc", label: "Zinc", swatch: "hsl(240 5.9% 10%)" },
  { id: "red", label: "Red", swatch: "hsl(0 72.2% 50.6%)" },
  { id: "rose", label: "Rose", swatch: "hsl(346.8 77.2% 49.8%)" },
  { id: "orange", label: "Orange", swatch: "hsl(24.6 95% 53.1%)" },
  { id: "green", label: "Green", swatch: "hsl(142.1 76.2% 36.3%)" },
  { id: "blue", label: "Blue", swatch: "hsl(221.2 83.2% 53.3%)" },
  { id: "violet", label: "Violet", swatch: "hsl(262.1 83.3% 57.8%)" },
];

export type ColorThemeId = (typeof COLOR_THEMES)[number]["id"];

/**
 * Starting color preset for a fresh install. `scripts/setup.ts` regex-
 * replaces this literal's value based on the "which theme?" prompt. Runtime
 * switching still works regardless of this default (theme-switcher.tsx).
 */
export const DEFAULT_COLOR_THEME = "zinc";

export function isColorThemeId(value: string): value is ColorThemeId {
  return COLOR_THEMES.some((theme) => theme.id === value);
}

/** Mode = light/dark/system, handled by next-themes (see providers/theme-provider.tsx). */
export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/**
 * Starting mode for a fresh install. `scripts/setup.ts` regex-replaces this
 * literal's value based on the "default appearance" prompt.
 */
export const DEFAULT_THEME_MODE: ThemeMode = "system";

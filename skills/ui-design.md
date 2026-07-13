---
name: ui-design
description: Deep-dive on this template's Tailwind v4 design tokens, the two independent theming dimensions (mode + color preset) and their providers, the radius scale, and the spacing/typography conventions used throughout app/page.tsx and the UI kit.
---

# UI design system & theming

This template ships a Tailwind v4, CSS-variable-driven design system (`app/globals.css`) with **two independent theme dimensions** layered on top of it, plus a small set of spacing/typography conventions you should match rather than reinvent. Read this before touching `app/globals.css`, adding a color preset, or building a new page/component.

## Two independent theme dimensions

There are two separate axes of "theme," each with its own provider, its own storage key, and its own CSS mechanism. They compose independently — don't conflate them.

| Dimension | Provider | Storage | CSS mechanism |
|---|---|---|---|
| Light/dark/system **mode** | `providers/theme-provider.tsx` (wraps `next-themes`) | next-themes' own localStorage key | `.dark` class on `<html>` |
| Accent **color preset** (zinc/red/rose/orange/green/blue/violet) | `providers/color-theme-provider.tsx` | `localStorage["color-theme"]` (`COLOR_THEME_STORAGE_KEY`) | `data-theme="<id>"` attribute on `<html>` |

Both are driven by a single source of truth, `lib/themes.ts`:

```ts
export const COLOR_THEMES: ColorTheme[] = [
  { id: "zinc", label: "Zinc", swatch: "hsl(240 5.9% 10%)" },
  { id: "red", label: "Red", swatch: "hsl(0 72.2% 50.6%)" },
  { id: "rose", label: "Rose", swatch: "hsl(346.8 77.2% 49.8%)" },
  { id: "orange", label: "Orange", swatch: "hsl(24.6 95% 53.1%)" },
  { id: "green", label: "Green", swatch: "hsl(142.1 76.2% 36.3%)" },
  { id: "blue", label: "Blue", swatch: "hsl(221.2 83.2% 53.3%)" },
  { id: "violet", label: "Violet", swatch: "hsl(262.1 83.3% 57.8%)" },
];

export const DEFAULT_COLOR_THEME = "zinc";

export const THEME_MODES = ["light", "dark", "system"] as const;
export const DEFAULT_THEME_MODE: ThemeMode = "system";
```

`scripts/setup.ts` prompts "which color theme?" / "default appearance?" at install time and regex-replaces the two `DEFAULT_*` literals above — that only changes what a first-time visitor sees before they touch anything. Every preset and mode is still switchable at runtime regardless of the install-time default.

### `providers/theme-provider.tsx` — mode

Thin wrapper around `next-themes`:

```tsx
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
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

export { useTheme } from "next-themes";
```

`attribute="class"` is next-themes' `.dark` class strategy — it toggles the `dark` class on `<html>`, which is what `app/globals.css`'s `@custom-variant dark (&:is(.dark *))` and every `dark:` Tailwind variant key off of. `useTheme` is re-exported from the same file so consumers get "mode" and "color" from two adjacent, symmetrically-named hooks (`useTheme` / `useColorTheme`).

### `providers/color-theme-provider.tsx` — color preset

Sets `data-theme="<preset id>"` on `<html>`, persisted to `localStorage["color-theme"]`. The actual color values live in `app/globals.css` as `[data-theme="<id>"]` blocks (next section).

```tsx
export const COLOR_THEME_STORAGE_KEY = "color-theme";
const ATTRIBUTE = "data-theme";

export function ColorThemeProvider({ children, defaultTheme = DEFAULT_COLOR_THEME }) {
  const initialTheme = isColorThemeId(defaultTheme) ? defaultTheme : DEFAULT_COLOR_THEME;
  const [theme, setThemeState] = useState<ColorThemeId>(() => {
    if (typeof window === "undefined") return initialTheme;
    const stored = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    return stored && isColorThemeId(stored) ? stored : initialTheme;
  });

  useEffect(() => {
    applyThemeAttribute(theme);
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
  }, [theme]);
  // ...
}

export function useColorTheme(): ColorThemeContextValue { /* theme, setTheme */ }
export { COLOR_THEMES };
```

Note the lazy `useState` initializer (not a `useEffect`) reads whatever the no-flash script already wrote to `<html>`, so React's first client render matches the DOM instead of committing the SSR default and re-rendering into the stored one a tick later.

Both providers compose in `providers/index.tsx`'s `<AppProviders>`, nested `ThemeProvider > ColorThemeProvider > ...`, mounted once in `app/layout.tsx`.

## `app/globals.css` structure

Four layers, top to bottom:

1. **Tailwind + `@theme inline` token wiring** — maps `--color-primary: var(--primary)` etc. (plus `--radius-sm/md/lg/xl/2xl/3xl/4xl`, see below) so Tailwind utility classes like `bg-primary`/`text-muted-foreground`/`rounded-xl` resolve to the CSS custom properties defined below.
2. **`:root` / `.dark`** — the neutral base palette, in `oklch(...)` color space. This is the "zinc" (neutral) foundation and it stays unchanged across every color preset:
   - `--background`, `--foreground`
   - `--card`, `--card-foreground`
   - `--popover`, `--popover-foreground`
   - `--primary`, `--primary-foreground`
   - `--secondary`, `--secondary-foreground`
   - `--muted`, `--muted-foreground`
   - `--accent`, `--accent-foreground`
   - `--destructive`
   - `--border`, `--input`, `--ring`
   - `--chart-1` through `--chart-5`
   - `--radius: 0.625rem`
   - `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring`
3. **`[data-theme="X"]` / `.dark[data-theme="X"]` override blocks** — one pair per non-default color preset (`red`, `rose`, `orange`, `green`, `blue`, `violet`; `zinc` needs no block since it *is* the `:root`/`.dark` base). Each block overrides **exactly six tokens**: `--primary`, `--primary-foreground`, `--ring`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-ring`. Example (`blue`):

   ```css
   [data-theme="blue"] {
     --primary: hsl(221.2 83.2% 53.3%);
     --primary-foreground: hsl(210 40% 98%);
     --ring: hsl(221.2 83.2% 53.3%);
     --sidebar-primary: hsl(221.2 83.2% 53.3%);
     --sidebar-primary-foreground: hsl(210 40% 98%);
     --sidebar-ring: hsl(221.2 83.2% 53.3%);
   }
   .dark[data-theme="blue"] {
     --primary: hsl(217.2 91.2% 59.8%);
     --primary-foreground: hsl(222.2 47.4% 11.2%);
     --ring: hsl(224.3 76.3% 48%);
     --sidebar-primary: hsl(217.2 91.2% 59.8%);
     --sidebar-primary-foreground: hsl(222.2 47.4% 11.2%);
     --sidebar-ring: hsl(224.3 76.3% 48%);
   }
   ```

   **Why only those six tokens?** `background`, `foreground`, `card`, `popover`, `border`, `input`, `secondary`, `muted`, `accent`, `destructive`, and the chart colors are deliberately left untouched by every preset. That keeps `background`/`card`/`border`/etc. pixel-identical across `zinc`/`red`/`rose`/`orange`/`green`/`blue`/`violet` — only the "brand" accent color (buttons, focus rings, the sidebar's active/primary state) actually changes. If every preset also shifted the neutral tint, switching presets would visibly change the whole UI's temperature, not just its accent — the current design intentionally avoids that. Values are lifted from shadcn/ui's official theme registry (`https://ui.shadcn.com/r/themes.css`), so they're pre-validated contrast-checked pairings, not invented on the spot — which is also why these blocks use `hsl(...)` while the `:root`/`.dark` base uses `oklch(...)`; both are valid CSS colors and Tailwind doesn't care which color function a custom property uses.

4. **`@layer base`** — the three global resets: every element gets `border-border outline-ring/50`, `body` gets `bg-background text-foreground`, `html` gets `font-sans`.

### Adding a new color preset

Exactly two things, both called out in `lib/themes.ts`'s own header comment:

1. Add a `[data-theme="foo"]` + `.dark[data-theme="foo"]` block to `app/globals.css`, overriding only `--primary` / `--primary-foreground` / `--ring` / `--sidebar-primary` / `--sidebar-primary-foreground` / `--sidebar-ring`. Leave every other token alone.
2. Add one entry to `COLOR_THEMES` in `lib/themes.ts` with a matching `id` (and a `label` + `swatch` for the theme-switcher dropdown).

That's it — no other file needs to change. `theme-switcher.tsx`, `isColorThemeId`, and `scripts/setup.ts`'s install-time prompt all read off `COLOR_THEMES` directly.

## Flash-of-wrong-theme guard

`ColorThemeProvider` inlines a tiny synchronous `<script>` via `dangerouslySetInnerHTML`:

```tsx
function NoFlashScript({ storageKey, fallback }: { storageKey: string; fallback: string }) {
  const script = `(function(){try{var t=localStorage.getItem(${JSON.stringify(storageKey)})||${JSON.stringify(fallback)};document.documentElement.setAttribute(${JSON.stringify(ATTRIBUTE)},t);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
```

**Why this is necessary:** the stored color preference only exists in `localStorage`, and `localStorage` isn't reachable during SSR or the initial HTML paint — the server has no idea what a returning visitor picked last time. Without this script, the page would render with `DEFAULT_COLOR_THEME` first, then React would hydrate, read `localStorage`, and swap `data-theme` — a visible flash from (e.g.) zinc to violet on every load. The inline script runs synchronously, before React hydrates and before the browser paints, so `data-theme` is already correct on the very first frame. It has to stay inline (no external `<script src>`) specifically so there's no extra network round trip delaying it past first paint.

`next-themes` handles the equivalent guard for light/dark mode itself internally (that's part of why `providers/theme-provider.tsx` doesn't need to reimplement one) — this template only had to build the no-flash script for the color-preset dimension because that's custom code, not something `next-themes` covers.

## `components/theme-switcher.tsx`

One dropdown covers both dimensions, composing `useTheme()` (mode, from `next-themes`) and `useColorTheme()` (color preset, from `providers/color-theme-provider.tsx`):

```tsx
export function ThemeSwitcher() {
  const { resolvedTheme, theme: mode, setTheme: setMode } = useTheme();
  const { theme: colorTheme, setTheme: setColorTheme } = useColorTheme();

  const ModeIcon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Change theme" />}>
        <ModeIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        {THEME_MODES.map((option) => { /* one DropdownMenuItem per mode, Check icon when active */ })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Color theme</DropdownMenuLabel>
        {COLOR_THEMES.map((preset) => (
          <DropdownMenuItem key={preset.id} onClick={() => setColorTheme(preset.id)}>
            <span className="size-3.5 rounded-full border" style={{ backgroundColor: preset.swatch }} aria-hidden />
            {preset.label}
            {colorTheme === preset.id ? <Check className="ml-auto size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Structurally it's one `DropdownMenu` with two labeled sections: "Appearance" iterates `THEME_MODES` (`light`/`dark`/`system`, icon from a `Record<ThemeMode, ComponentType<SVGProps<SVGSVGElement>>>` lookup — `Sun`/`Moon`/`Laptop`) and calls `setMode`; "Color theme" iterates `COLOR_THEMES` from `lib/themes.ts`, rendering `preset.swatch` as an inline `backgroundColor` style on a small rounded dot, and calls `setColorTheme`. Both sections show a `Check` icon (`ml-auto size-3.5`) next to whichever option is currently active. This is the pattern to follow if you ever need a third theme dimension: add a labeled section, iterate the metadata array, wire the setter, mirror the `Check`-when-active convention.

## Radius scale

One variable drives the entire scale via `calc()` multipliers, defined in the `@theme inline` block:

```css
--radius-sm: calc(var(--radius) * 0.6);
--radius-md: calc(var(--radius) * 0.8);
--radius-lg: var(--radius);
--radius-xl: calc(var(--radius) * 1.4);
--radius-2xl: calc(var(--radius) * 1.8);
--radius-3xl: calc(var(--radius) * 2.2);
--radius-4xl: calc(var(--radius) * 2.6);
```

with `--radius: 0.625rem` set once in `:root`. **Never hardcode `rounded-[Npx]`** — always reach for one of `rounded-sm`/`rounded-md`/`rounded-lg`/`rounded-xl`/`rounded-2xl`/`rounded-3xl`/`rounded-4xl`. Bumping the single `--radius` value (e.g. for a sharper- or rounder-looking install) cascades correctly through every component and surface in the app instead of requiring a find-and-replace across arbitrary pixel values.

## Spacing/typography conventions (observed in `app/page.tsx`)

`app/page.tsx` is the reference implementation for these — match it rather than freelancing new spacing/type conventions:

- **`text-balance`** on any heading or subhead that wraps to multiple lines, for even line breaks: `<h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight md:text-6xl">`, `<p className="max-w-xl text-balance text-muted-foreground md:text-lg">`.
- **Icon sizing via `size-*`**, never separate `h-*`/`w-*` pairs: `<Sparkles className="size-3.5" />`, `<ArrowRight className="size-4" />`. The `Button` component itself defaults inline SVG children to `size-4` unless overridden.
- **Card radius conventions**: content blocks (feature cards, panels) use `rounded-xl border bg-card p-5` — e.g. `<div className="rounded-xl border bg-card p-5">`. `rounded-lg` is reserved for controls (buttons, inputs, form elements) per the radius scale's own token naming (`--radius-lg` maps 1:1 to `--radius`, the "default" size); larger surfaces step up to `rounded-xl` and beyond.
- **Vertical rhythm**: generous spacing at the page/section level — `gap-16` between major blocks, `py-16 md:py-24` for the main content region's vertical padding — versus tighter `gap-4`/`gap-6` inside a grid of cards (`<div className="grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">`). Don't use the same gap value at both scales — the contrast between generous page rhythm and tight grid rhythm is intentional.
- **`text-muted-foreground` for secondary text** — subheads, card descriptions, footer copy. Never reach for a raw gray utility (`text-gray-500` etc.); the token already resolves correctly across every mode/color-preset combination.

## Base UI `render` prop for design work

Components in this template are shadcn/ui built on **Base UI** (`@base-ui/react`), not Radix — there's no `asChild`. To make a component render as a different underlying element while keeping its own styling/props, pass the target element to `render`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

<Button size="lg" nativeButton={false} render={<Link href="/register" />}>
  Create an account <ArrowRight className="size-4" />
</Button>
```

This is the pattern behind every nav/CTA button in `app/page.tsx` that needs to actually navigate (`Log in`, `Get started`, `Create an account`, `View dashboard`) — `Button` supplies the visual variant/size, `render={<Link href="..." />}` supplies real client-side navigation instead of a dead `<button>`. The full set of `render`-prop gotchas (notably `nativeButton={false}` being required specifically on `Button`, and which other trigger components — `DropdownMenuTrigger`, `SidebarMenuButton`, `TabsTrigger`, etc. — don't need it) lives in the `shadcn-ui` skill; this file only calls out the pattern as it bears on visual/navigation design, not the full API surface.

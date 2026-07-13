"use client";

/**
 * Combined appearance switcher — light/dark/system mode (next-themes, via
 * providers/theme-provider.tsx) AND accent color preset (providers/color-
 * theme-provider.tsx), in one dropdown. Replaces the old single-purpose
 * ModeToggle; mount this in components/layout/site-header.tsx.
 */
import type { ComponentType, SVGProps } from "react";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useColorTheme, COLOR_THEMES } from "@/providers/color-theme-provider";
import { THEME_MODES, type ThemeMode } from "@/lib/themes";

const MODE_ICON: Record<ThemeMode, ComponentType<SVGProps<SVGSVGElement>>> = {
  light: Sun,
  dark: Moon,
  system: Laptop,
};

export function ThemeSwitcher() {
  const { resolvedTheme, theme: mode, setTheme: setMode } = useTheme();
  const { theme: colorTheme, setTheme: setColorTheme } = useColorTheme();

  const ModeIcon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Change theme" />}
      >
        <ModeIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        {THEME_MODES.map((option) => {
          const Icon = MODE_ICON[option];
          return (
            <DropdownMenuItem key={option} onClick={() => setMode(option)}>
              <Icon className="size-4" />
              <span className="capitalize">{option}</span>
              {mode === option ? <Check className="ml-auto size-3.5" /> : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Color theme</DropdownMenuLabel>
        {COLOR_THEMES.map((preset) => (
          <DropdownMenuItem key={preset.id} onClick={() => setColorTheme(preset.id)}>
            <span
              className="size-3.5 rounded-full border"
              style={{ backgroundColor: preset.swatch }}
              aria-hidden
            />
            {preset.label}
            {colorTheme === preset.id ? <Check className="ml-auto size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

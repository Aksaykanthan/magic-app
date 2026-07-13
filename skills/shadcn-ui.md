---
name: shadcn-ui
description: Deep dive on shadcn/ui in this template — it's wired to Base UI (not Radix), so component APIs (render prop instead of asChild, nativeButton gotcha), the CLI, component conventions, the sidebar system, icons, and toasts all differ from typical shadcn tutorials.
---

# shadcn/ui (on Base UI, not Radix)

## The one fact that changes everything

`components.json` in this repo:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

`"style": "base-nova"` means every primitive under `components/ui/` is generated against **[Base UI](https://base-ui.com)** (`@base-ui/react`), not Radix UI. Almost every shadcn tutorial, blog post, and a huge fraction of any LLM's training data assumes Radix. **Do not** reach for Radix APIs here — `asChild`, `Radix*Primitive` imports, Radix's `forwardRef` patterns, etc. do not exist in this codebase. The two libraries are similar in spirit (unstyled, accessible primitives) but differ in concrete API shape. The rest of this doc covers where they diverge in practice.

## `asChild` → `render`

Radix's polymorphism prop is `asChild`. Base UI's equivalent is `render`, and the mechanics differ: instead of a boolean that says "treat my single child as the root," you pass the *element itself* to `render`, and Base UI merges its own props/handlers/`data-*` state onto that element. The element's own children are discarded — the wrapping component's `children` win.

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

<Button size="lg" nativeButton={false} render={<Link href="/register" />}>
  Create an account
</Button>
```

This is used throughout the template — e.g. `app/page.tsx`'s hero CTAs, and `components/layout/app-sidebar.tsx`'s nav items (see the [sidebar section](#the-sidebar-system) below).

### The `nativeButton={false}` gotcha

The literal `Button` component (`components/ui/button.tsx`) wraps Base UI's `Button` primitive, which defaults to `nativeButton={true}` — it assumes it's rendering a real `<button>` and wires up keyboard/ARIA behavior accordingly. When you swap the underlying element via `render` to something that isn't a native button (a `Link` → `<a>`, for instance), Base UI notices the mismatch and warns loudly in dev:

> `Base UI: A component that acts as a button expected a native <button>, but a different tag was rendered. Set nativeButton={false} if this is intentional, for example when this component visually looks like a button but is semantically a different element (like a div or a link).`

Fix: always pass `nativeButton={false}` alongside `render` on `Button` when the target isn't a `<button>`:

```tsx
<Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/login" />}>
  Log in
</Button>
```

Other Base UI-backed trigger components in this repo (`SidebarMenuButton`, `DropdownMenuItem`, `DropdownMenuTrigger`, `TabsTrigger`, …) are built on a lower-level primitive (`useRender`, see below) and do **not** need `nativeButton` — that prop is specific to the `Button` component itself. If you don't need a different underlying element at all, just nest a plain child; Base UI triggers already render real `<button>`s by default.

## Adding a new component

```bash
bunx shadcn@latest add <name>
```

The CLI reads `components.json`'s `style: "base-nova"` (and the `base` UI target it implies) before generating, so it emits the Base UI variant of the component automatically — you don't pass any extra flags to opt into Base UI. After adding, skim the generated file for `render`/`useRender`/`mergeProps` usage before wiring it up, since the prop surface will differ from any Radix-based example you might be pattern-matching against.

## Anatomy of a `components/ui/*.tsx` primitive

Every primitive in `components/ui/` follows the same shape. `components/ui/button.tsx` end to end:

```tsx
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg …",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline: "border-border bg-background hover:bg-muted …",
        secondary: "bg-secondary text-secondary-foreground …",
        ghost: "hover:bg-muted hover:text-foreground …",
        destructive: "bg-destructive/10 text-destructive …",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 gap-1.5 px-2.5 …",
        xs: "h-6 gap-1 …",
        sm: "h-7 gap-1 …",
        lg: "h-9 gap-1.5 px-2.5 …",
        icon: "size-8",
        "icon-xs": "size-6 …",
        "icon-sm": "size-7 …",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

Conventions to copy when writing or editing anything in `components/ui/`:

- **`data-slot="<name>"`** on the rendered element (or every rendered part, for multi-part components — `dropdown-menu-trigger`, `dropdown-menu-content`, etc.). This is a styling/selector hook (`in-data-[slot=button-group]:rounded-lg`, `has-data-[icon=inline-end]:pr-2`), not decoration — don't drop it when customizing a component.
- **`cva` for variants**, imported from `class-variance-authority`, with a `variants` object plus `defaultVariants`. Variant props are typed via `VariantProps<typeof xVariants>` merged into the component's prop type.
- **`cn()` from `@/lib/utils`** (a `clsx` + `tailwind-merge` wrapper) wraps every `className` computation — `cn(buttonVariants({ variant, size, className }))` — so caller-supplied classes correctly override the variant defaults instead of just concatenating.
- **Import the Base UI primitive under an alias**, e.g. `Button as ButtonPrimitive`, `Menu as MenuPrimitive` (`dropdown-menu.tsx`), and type props off the primitive's own namespace (`ButtonPrimitive.Props`, `MenuPrimitive.Popup.Props`) rather than hand-writing a prop interface.
- **Components without a dedicated Base UI primitive** (plain `<span>`/`<div>`-based ones like `Badge`) use the lower-level `useRender` + `mergeProps` from `@base-ui/react/use-render` / `@base-ui/react/merge-props` directly to get `render`-prop polymorphism without a matching Base UI package:

  ```tsx
  // components/ui/badge.tsx
  function Badge({ className, variant = "default", render, ...props }: …) {
    return useRender({
      defaultTagName: "span",
      props: mergeProps<"span">({ className: cn(badgeVariants({ variant }), className) }, props),
      render,
      state: { slot: "badge", variant },
    })
  }
  ```

  `components/ui/sidebar.tsx` uses this same `useRender`/`mergeProps` pattern for `SidebarMenuButton`, `SidebarGroupLabel`, `SidebarGroupAction`, `SidebarMenuAction`, `SidebarMenuSubButton` — anything sidebar-specific that needs `render` support but isn't a dedicated Base UI component.

## App-specific components vs. `ui/` primitives

`components/ui/*` are the unstyled-but-themed shadcn primitives — generic, app-agnostic, safe to regenerate via the CLI. Anything that encodes actual product logic or a specific composition (nav structure, a form, a user menu) lives in a domain folder next to `ui/`: `components/auth/` (`login-form.tsx`, `register-form.tsx`), `components/layout/` (`app-sidebar.tsx`, `site-header.tsx`, `user-nav.tsx`), `components/settings/` (`logout-button.tsx`), etc.

The convention is strict composition: domain components are built **out of** `ui/` primitives, never by hand-rolling new low-level markup that duplicates what a primitive already does. `components/layout/app-sidebar.tsx` imports `Sidebar`, `SidebarHeader`, `SidebarMenu`, `SidebarMenuButton`, … from `@/components/ui/sidebar` and only adds the app's own nav data and `Link`/`usePathname` wiring — it never reimplements sidebar markup or state. When adding a new domain component, check `components/ui/` first for a primitive that already covers the shape you need (dialog, sheet, dropdown, form control) before writing raw JSX.

## lucide-react: no brand icons

This template is on lucide-react v1.x. **Brand/logo icons (GitHub, Twitter/X, Google, Discord, etc.) are not exported** — v1 dropped the brand icon set entirely. Stick to generic, semantic icons; if you need a real brand mark, use an SVG asset or another icon package instead of assuming `lucide-react` has it.

Real icons actually imported in this repo (`grep -r 'from "lucide-react"' components/`):

- `components/layout/app-sidebar.tsx`: `LayoutDashboard`, `Settings`, `Sparkles` — nav-item and logo icons.
- `components/ui/sidebar.tsx`: `PanelLeftIcon` — the collapse/expand trigger.
- `components/ui/dropdown-menu.tsx`: `ChevronRightIcon`, `CheckIcon` — submenu carets and checked-item marks.
- `components/ui/sonner.tsx`: `CircleCheckIcon`, `InfoIcon`, `TriangleAlertIcon`, `OctagonXIcon`, `Loader2Icon` — toast status icons.
- `components/auth/login-form.tsx` / `register-form.tsx`: `Loader2` — spinner shown while `form.formState.isSubmitting`.
- `components/layout/user-nav.tsx`: `ChevronsUpDown`, `LogOut`, `Settings`.

## The sidebar system

`components/ui/sidebar.tsx` is shadcn's large "sidebar-07"-style composite primitive (state/context, mobile sheet fallback, icon-collapse mode, keyboard shortcut, cookie-persisted open state) rebuilt on Base UI. This template imports the full set:

```tsx
import {
  Sidebar,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
```

Layout wiring, `app/(app)/layout.tsx`:

```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>
    <SiteHeader />
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</div>
  </SidebarInset>
</SidebarProvider>
```

`SidebarProvider` owns the open/collapsed state (desktop) and open-mobile state (mobile sheet fallback) via `useSidebar()`; `SidebarInset` is the `<main>` that sits beside the sidebar and shifts with it. `SidebarTrigger` (used in `site-header.tsx`) is a `Button`-based collapse toggle that calls `useSidebar().toggleSidebar()`.

Nav composition, `components/layout/app-sidebar.tsx` (real code from this repo):

```tsx
const NAV_ITEMS = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Magic Next.js</span>
                <span className="truncate text-xs text-muted-foreground">Template</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={pathname === item.url}
                    render={<Link href={item.url} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserNav />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
```

Notes on this pattern:

- `isActive={pathname === item.url}` drives the `data-active` state used by `sidebarMenuButtonVariants` (active items get `data-active:bg-sidebar-accent data-active:font-medium …`) — compute it from `usePathname()`, don't hand-maintain a separate "current" flag.
- `render={<Link href={item.url} />}` is the same `render`-prop polymorphism as `Button`, but note `SidebarMenuButton` does **not** need `nativeButton={false}` — it's built on `useRender`/`mergeProps` directly (see [above](#anatomy-of-a-componentsuitsx-primitive)), not the `Button` primitive, so the native-button warning doesn't apply here.
- `tooltip={item.title}` auto-wraps the button in `Tooltip`/`TooltipTrigger`/`TooltipContent`, shown only when the sidebar is collapsed to icon-only mode (`hidden={state !== "collapsed" || isMobile}` inside `SidebarMenuButton`'s implementation) — you get the collapsed-icon tooltip for free by passing a string, no manual `Tooltip` wiring needed.
- To add a nav entry: add one object to `NAV_ITEMS` (`title`, `url`, `icon` from `lucide-react`) — the `.map()` handles the rest.

## Toasts

Toast notifications come from `sonner`, re-exported/themed via `components/ui/sonner.tsx` (mounted once, typically in `app/layout.tsx`, as `<Toaster />`). Trigger toasts by importing `toast` directly from `sonner`:

```tsx
import { toast } from "sonner";

toast.success("Signed in");
toast.error("Something went wrong");
```

Real call site, `components/auth/login-form.tsx` (same pattern in `register-form.tsx`), inside a better-auth `onError` handler:

```tsx
import { toast } from "sonner";
// …
signIn.email(
  { email, password },
  {
    onError: (ctx) => {
      toast.error(ctx.error.message);
    },
  }
);
```

`toast.error(ctx.error.message)` surfaces the server-provided error string directly — don't wrap it in a generic "Something went wrong" unless the API genuinely returns nothing useful. Use `toast.success(...)` for the mirror case (e.g. after a mutation succeeds) following the same shape.

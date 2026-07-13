---
name: frontend-conventions
description: Deep-dive on this template's App Router structure, provider composition, route-group/auth-guard split, Server vs Client Component boundaries, and form conventions — read before adding a page, provider, or form.
---

# Frontend conventions

This template is a Next.js 16 App Router app. The conventions below are load-bearing: `scripts/setup.ts` depends on some of them (see the provider-composition and marker notes), and the rest exist so new pages/components read like the ones already here instead of introducing a second style. Read this before adding a page, a provider, or a form.

## App Router structure & the composition root

`app/layout.tsx` is the **only** place that touches `<html>`/`<body>`. Its whole job is fonts + one wrapper:

```tsx
// app/layout.tsx
<html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
  <body className="min-h-full flex flex-col">
    <AppProviders>{children}</AppProviders>
  </body>
</html>
```

Every context provider in the app is nested inside `providers/index.tsx`'s `<AppProviders>`, not hand-written in `app/layout.tsx`. The file's own doc comment explains why: it's a single composition root so the root layout stays readable as providers get added, and so `bun run setup` can surgically remove `<TRPCProvider>`/`<AuthProvider>` (regex-matched by exact tag name) when you drop the `trpc`/`auth` module without hand-editing `app/layout.tsx`.

The actual nesting, in order:

```tsx
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
```

**Order matters, and it's not arbitrary:**
- `ThemeProvider`/`ColorThemeProvider` are outermost because their attributes (`.dark` class, `data-theme="..."`) land on `<html>`/`<body>` before anything nested below tries to read a theme.
- `TooltipProvider` is innermost — it's pure UI state with no dependency on anything else, so it wraps the tightest.
- `TRPCProvider`/`AuthProvider` sit in the middle, and their JSX tags must stay on their own line with **no extra props and no unrelated JSX between the open tag and its children** — `scripts/setup.ts`'s `unwrapJsxWrapper` does an exact-match-on-its-own-line removal when the backing module is dropped, and silently no-ops (leaving a dangling import) if the shape doesn't match.

**The rule:** never hand-nest a provider directly in `app/layout.tsx` again. Adding a new cross-cutting provider means: create it under `providers/`, then add it to `providers/index.tsx`'s nesting (respecting the ordering rationale above), never touch `app/layout.tsx` itself.

## `next/font` setup — don't redeclare fonts elsewhere

`app/layout.tsx` loads both template fonts once, as CSS variables:

```tsx
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
```

...and applies both variable classes to `<html>`. Tailwind v4's default `font-sans`/`font-mono` utilities already resolve to `--font-geist-sans`/`--font-geist-mono` via the CSS-first theme in `app/globals.css` — you get Geist by just using `font-sans`/`font-mono` (or not specifying a font family at all, since it's the default). Never add a second `next/font` call in a page or component; if you need a different typeface for one section, extend the `@theme` block in `globals.css` instead of loading fonts ad hoc.

## Route groups: `(auth)` vs `(app)`

```
app/
  (auth)/                   # bare centered layout — /login, /register
    layout.tsx
    login/page.tsx
    register/page.tsx
  (app)/                    # dashboard shell — /dashboard, /settings
    layout.tsx
    dashboard/page.tsx
    settings/page.tsx
```

The parens are a Next.js route-group convention: they group routes for layout purposes without adding a URL segment. `app/(auth)/login/page.tsx` serves `/login`, `app/(app)/dashboard/page.tsx` serves `/dashboard` — the `(auth)`/`(app)` segments never appear in the URL.

- **`(auth)`** (`app/(auth)/layout.tsx`) is a bare centered layout: a `min-h-svh` flex column, a logo link back to `/`, and a `max-w-sm` slot for the page content (a `Card` in practice — see `LoginPage` below).
- **`(app)`** (`app/(app)/layout.tsx`) is the authenticated dashboard shell with a sidebar — see [Dashboard shell composition](#dashboard-shell-composition) below.

**Critical: auth enforcement lives exclusively in `proxy.ts`.** Nothing under `app/(app)/**` checks for a session itself. `DashboardPage` calls `auth.api.getSession()` to *read* the session (for `session.user.name`, etc.), but if that call somehow returned `null` it just returns `null` rather than redirecting — because by the time a request reaches a page under `(app)`, `proxy.ts` has already guaranteed a session exists. **Never add `if (!session) redirect(...)` inside a page or layout under `app/(app)/**`** — that duplicates logic that's already centralized, and the two checks can drift out of sync (e.g. if the matcher and an inline check ever disagree about which paths are protected).

## `proxy.ts`

`proxy.ts` at the repo root is Next.js 16's replacement for `middleware.ts` (see the [proxy file convention docs](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)). Two things distinguish it from the old middleware model:

- It runs on the **Node.js runtime**, not the Edge runtime — the file's own comment notes this is specifically so `auth.api.getSession` can hit Redis/Postgres directly instead of going through an internal HTTP round trip (which is what calling better-auth from Edge middleware would otherwise require).
- It exports a `proxy` function (not `middleware`) plus the same `config.matcher` shape as before.

The exact logic, quoted from the file:

```ts
const AUTH_ROUTES = ["/login", "/register"];

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const { pathname } = request.nextUrl;

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (isAuthRoute) {
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/login", "/register"],
};
```

The two rules it implements, precisely:

1. If the path is `/login` or `/register` **and** a session exists → redirect to `/dashboard`.
2. If the path is anything else matched by `config.matcher` **and no** session exists → redirect to `/login?redirectTo=<original path>` (the `redirectTo` query param is what `LoginFormInner` reads via `useSearchParams().get("redirectTo")` to send the user back where they came from after signing in).

**To protect a new route, add its pattern to `matcher` — nothing else.** Don't write a second auth check anywhere downstream of that matcher; `proxy.ts` is the single source of truth for "is this request allowed here."

## Server Components vs Client Components

Default every `app/**/page.tsx` to a Server Component. Only reach for `"use client"` on small leaf components that actually need hooks, event handlers, or browser APIs — forms, anything calling `useAuth()`/`useTRPC()`, interactive widgets. Don't mark a whole page `"use client"` just because one child needs interactivity; push the boundary down instead.

**Server Component page example** — `app/(app)/dashboard/page.tsx`:

```tsx
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  prefetch(trpc.post.list.queryOptions());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {session.user.name}.</p>
      </div>
      <HydrateClient>
        <PostList />
      </HydrateClient>
    </div>
  );
}
```

This is an `async` Server Component: it reads the session server-side via `auth.api.getSession` (no client round trip needed for the greeting), then calls `prefetch(trpc.post.list.queryOptions())` to warm the React Query cache on the server before rendering `<HydrateClient>` around the client-side `<PostList>` — so the list's data is already in cache by the time the client component mounts, no loading spinner on first paint. The page itself never imports `"use client"` or any hook.

**Client Component leaf example** — `components/dashboard/post-list.tsx` is the client half of that same pattern: `"use client"` at the top, `useTRPC()` + `useQuery(trpc.post.list.queryOptions())` (which hits the cache `prefetch` already populated), and its own loading/empty states. It's kept small and single-purpose — the surrounding page composition, headings, and layout all stay in the Server Component.

## Forms: react-hook-form + zodResolver + hand-wired labels

There is **no shadcn `<Form>` wrapper component** in this Base UI setup — the shadcn Base UI registry doesn't ship one (unlike the Radix-based shadcn registry, which has `Form`/`FormField`/`FormItem`/etc.). Forms here are hand-wired: `Label htmlFor` paired with `Input id`, `react-hook-form`'s `form.register(...)` spread directly onto the `Input`, and an inline conditional error paragraph. This is the canonical shape to copy — from `components/auth/login-form.tsx`:

```tsx
"use client";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});
type LoginValues = z.infer<typeof loginSchema>;

function LoginFormInner() {
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    await signIn.email(
      { email: values.email, password: values.password },
      {
        onSuccess: () => { router.push(searchParams.get("redirectTo") ?? "/dashboard"); router.refresh(); },
        onError: (ctx) => toast.error(ctx.error.message),
      },
    );
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!form.formState.errors.email}
          {...form.register("email")}
        />
        {form.formState.errors.email ? (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        ) : null}
      </div>
      {/* ...password field, same shape... */}
      <Button type="submit" disabled={form.formState.isSubmitting} className="mt-1.5 w-full">
        {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
        Log in
      </Button>
    </form>
  );
}
```

The recurring pieces to copy for any new form:

- A `zod` schema next to the component, with per-field error messages as the second arg to each validator (`z.string().email("Enter a valid email address.")`) — these strings are what render in the error `<p>`, so write them for end users.
- `useForm<Values>({ resolver: zodResolver(schema), defaultValues: {...} })`.
- Every field is a `<div className="flex flex-col gap-1.5">` containing `Label` (`htmlFor` matching the input's `id`), `Input` (`id` + `aria-invalid={!!form.formState.errors.<field>}` + `{...form.register("<field>")}`), and a conditional `<p className="text-sm text-destructive">{form.formState.errors.<field>?.message}</p>`.
- `<form noValidate>` — native browser validation is disabled; `zodResolver` is the only validation path, so error messages are consistent and testable.
- Submit `Button` uses `form.formState.isSubmitting` to disable itself and swap in a `Loader2` spinner — don't add separate `useState` for pending state.
- Toasts (`sonner`'s `toast.error(...)`) surface server-side failures (e.g. `onError: (ctx) => toast.error(ctx.error.message)`); the form itself doesn't render a top-level error banner.
- `LoginForm` (the exported wrapper) wraps `LoginFormInner` in `<Suspense>` because `LoginFormInner` calls `useSearchParams()`, which requires a Suspense boundary during static rendering — do the same for any form that reads search params.

`register-form.tsx` follows the identical shape (schema → `useForm` → labeled fields → submit button with `isSubmitting`) for a longer field set — use whichever of the two is closer to what you're building as your copy source.

## Session and theme access from Client Components

**Session** — read it with `useAuth()` from `@/providers/auth-provider`, never call `useSession()` (from `@/lib/auth-client`) directly in a component that just wants to *read* the session:

```tsx
"use client";
import { useAuth } from "@/providers/auth-provider";

const { session, isPending, refetch } = useAuth();
```

`useAuth()` reads a React context that wraps a single `authClient.useSession()` subscription, mounted once by `<AuthProvider>` in `providers/index.tsx`. The dedup rationale, straight from the provider's doc comment: without it, every component that needs the session would call `useSession()` independently, and each call fires its own `/api/auth/get-session` request — `useAuth()` means the whole tree shares one subscription and one request instead of N. Reserve direct imports from `@/lib/auth-client` (`signIn`, `signUp`, `signOut`, `authClient`) for *imperative* calls (mutations), not for reading session state.

**Theme** — `useTheme()` from `next-themes` for light/dark/system mode, `useColorTheme()` from `@/providers/color-theme-provider` for the accent color preset. `components/theme-switcher.tsx` (mounted in `SiteHeader`, see below) is the reference for using both together in one dropdown.

## Dashboard shell composition

`app/(app)/layout.tsx` is the actual shell every authenticated page renders inside:

```tsx
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

Reading outward to in:

- `SidebarProvider` (`components/ui/sidebar.tsx`) supplies the collapse/expand context every sidebar primitive below it needs.
- `AppSidebar` (`components/layout/app-sidebar.tsx`) is a `"use client"` component (it needs `usePathname()` for active-link highlighting): a `collapsible="icon"` `Sidebar` with a header logo link, a `NAV_ITEMS` list (`Dashboard` → `/dashboard`, `Settings` → `/settings`) rendered as `SidebarMenuButton`s using the Base UI `render` prop pattern (`render={<Link href={item.url} />}`), and a footer `<UserNav />`.
- `SidebarInset` wraps the main content column next to the sidebar.
- `SiteHeader` (`components/layout/site-header.tsx`) is the top bar inside that inset: a `SidebarTrigger` (the collapse toggle), an optional breadcrumb `title`, and — pinned right via `ml-auto` — the `<ThemeSwitcher />` (the combined light/dark/system + color-preset dropdown described above).
- The actual page content (`{children}` — e.g. `DashboardPage`) renders below `SiteHeader`, inside a `flex flex-1 flex-col gap-4 p-4 md:p-6` wrapper that every page under `(app)` shares without having to repeat that padding/gap itself.

Adding a new page under `(app)` means adding a folder + `page.tsx` and, if it belongs in primary nav, a new entry in `AppSidebar`'s `NAV_ITEMS` — the shell itself (`layout.tsx`) never needs to change.

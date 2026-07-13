---
name: better-auth
description: Deep dive on this template's better-auth integration — server vs client vs session context, wired auth methods (email/password, username, Google/GitHub OAuth, Turnstile captcha), rate limiting, mailer hooks, tRPC protection, proxy.ts route guarding, and how to add a new OAuth provider or require email verification.
---

# Better Auth Integration

## Three places auth lives, and when to reach for each

| Instance | File | Use it from | Purpose |
|---|---|---|---|
| Server instance | `lib/auth.ts` — `export const auth = betterAuth({...})` | Server Components, Route Handlers, Server Actions, `lib/trpc/init.ts`, `proxy.ts` | The actual auth engine — Prisma adapter, plugins, rate limiting, `auth.api.getSession()`, `auth.api.*` for anything server-side. |
| Client instance | `lib/auth-client.ts` — `export const authClient = createAuthClient({...})`, re-exports `signIn`/`signUp`/`signOut`/`useSession` | Client Components (`"use client"`) that need to *mutate* auth state (log in, log out, register, link a social account) | Talks to `app/api/auth/[...all]/route.ts` over HTTP. Never import this in a Server Component. |
| Session context | `providers/auth-provider.tsx` — `<AuthProvider>` + `useAuth()` | Client Components that only need to *read* the current session | Wraps `authClient.useSession()` in a React context so every component under `<AuthProvider>` (mounted once in `providers/index.tsx`) shares one subscription instead of each firing its own `/api/auth/get-session` request. |

Rule of thumb: **reading** the session in a Client Component → `useAuth()` from `providers/auth-provider.tsx`, never call `useSession()` yourself. **Mutating** it (sign in/up/out) → import `signIn`/`signUp`/`signOut` from `@/lib/auth-client` directly (`useAuth()` is read-only and throws if you look for a mutator on it). **Server-side** (layouts, Server Actions, route handlers, tRPC context) → `auth.api.getSession({ headers })` from `@/lib/auth`, never the client.

```ts
// Server Component / Server Action
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const session = await auth.api.getSession({ headers: await headers() });
```

```tsx
// Client Component — read
"use client";
import { useAuth } from "@/providers/auth-provider";

const { session, isPending, refetch } = useAuth(); // session?.user
```

```tsx
// Client Component — mutate
"use client";
import { signIn } from "@/lib/auth-client";

await signIn.email({ email, password }, { onSuccess: () => router.push("/dashboard") });
```

The client instance's `baseURL` comes from `env.NEXT_PUBLIC_APP_URL` (`lib/env.ts`) — keep `NEXT_PUBLIC_APP_URL`/`BETTER_AUTH_URL` in sync in `.env`, or callback/redirect URLs built server-side won't match what the browser is actually talking to.

## Auth methods actually wired

All of these live inside the single `betterAuth({...})` config in `lib/auth.ts`. Each optional one is fenced by a `// MAGIC:<name>:start/:end` comment pair that `scripts/setup.ts` strips at scaffold time if the user deselects it — treat everything below as live, current code, not a menu of maybes.

### Email + password (baseline, always on)

```ts
emailAndPassword: {
  enabled: true,
  minPasswordLength: 8,
  autoSignIn: true, // signing up immediately creates a session, no separate sign-in step
  sendResetPassword: async ({ user, url }) => { /* calls sendMail(), see Mailer below */ },
},
```

Client call: `signIn.email({ email, password }, { onSuccess, onError })` / `signUp.email({ name, email, password }, {...})`. See `components/auth/register-form.tsx` for the canonical form pattern (react-hook-form + zod, `form.formState.isSubmitting` drives the loading spinner, `onError: (ctx) => toast.error(ctx.error.message)`).

### Username (plugin pair: `username` server-side, `usernameClient` client-side)

Server: `plugins: [username()]` in `lib/auth.ts` — requires `emailAndPassword.enabled` (always true here). Client: `usernameClient()` registered in `lib/auth-client.ts`'s `plugins` array. Together they let a user authenticate with a `username` field that better-auth resolves as *either* an email or a literal username server-side:

```ts
// components/auth/login-form.tsx — when the username module is kept
await signIn.username(
  { username: values.identifier, password: values.password },
  { onSuccess: redirectTo, onError: (ctx) => toast.error(ctx.error.message) },
);
```

When this module is dropped, the login form falls back to a plain `signIn.email({ email, password }, {...})` call — both branches already exist in `login-form.tsx`, gated by `MAGIC:username` / `MAGIC:username-else` comment pairs.

### Google OAuth (gated on env, optional)

```ts
socialProviders: {
  ...(env.GOOGLE_CLIENT_ID
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET! } }
    : {}),
},
```

The provider entry only exists in the object when `GOOGLE_CLIENT_ID` is set — leaving it blank in `.env` silently disables the provider rather than erroring. Client call (see `login-form.tsx`'s `onGoogleSignIn`):

```ts
await signIn.social({ provider: "google", callbackURL: "/dashboard" });
```

### GitHub OAuth (same pattern, no `MAGIC` fence — always compiled in)

```ts
socialProviders: {
  ...(env.GITHUB_CLIENT_ID
    ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET! } }
    : {}),
  // ...google spread above
},
```

Unlike Google, this block isn't wrapped in a `MAGIC:google`-style comment pair — it ships unconditionally and is simply inert until `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are set. Sign-in call is identical: `signIn.social({ provider: "github", callbackURL: "/dashboard" })`.

### Cloudflare Turnstile captcha (`captcha` plugin)

Server: `plugins: [captcha({ provider: "cloudflare-turnstile", secretKey: env.TURNSTILE_SECRET_KEY! })]` in `lib/auth.ts`. The plugin rejects protected auth requests (sign-in, sign-up, forget-password, etc.) that don't carry a valid `x-captcha-response` header — it does **not** wire itself into any specific request; you pass the header yourself via `fetchOptions`.

Client side (`components/auth/login-form.tsx`): render the widget, capture its token in state, then thread it through `fetchOptions.headers` on the *actual* auth call:

```tsx
import { Turnstile } from "@marsidev/react-turnstile";

const [captchaToken, setCaptchaToken] = useState<string>("");

const onSubmit = async (values: LoginValues) => {
  const fetchOptions = captchaToken
    ? { headers: { "x-captcha-response": captchaToken } }
    : undefined;

  await signIn.email(
    { email: values.email, password: values.password },
    { onSuccess: redirectTo, onError: (ctx) => toast.error(ctx.error.message), fetchOptions },
  );
};

// in JSX:
<Turnstile
  siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
  onSuccess={setCaptchaToken}
  options={{ size: "flexible" }}
/>
```

Same pattern applies to `signUp.email(...)` on the register form. `TURNSTILE_SECRET_KEY` (server) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (client, safe to expose) are both defined in `lib/env.ts`.

## Rate limiting

better-auth ships rate limiting built in — no extra plugin needed, just config on the root `betterAuth({...})` call:

```ts
rateLimit: {
  enabled: true,
  window: 60,       // seconds — the sliding window
  max: 100,          // max requests per window, per IP
  storage: "secondary-storage",
},
```

`window`/`max` mean "at most `max` requests to *any* auth endpoint from the same IP within `window` seconds" — 100 requests / 60s is a broad default covering sign-in, sign-up, forget-password, social callbacks, everything mounted under `app/api/auth/[...all]/route.ts` together, not per-path. `storage: "secondary-storage"` tells better-auth to count hits in the same store as `secondaryStorage` (see below) — i.e. Redis when the `redis` module is kept, so limits are shared across server instances; if `redis` is dropped, `lib/auth.ts`'s `secondaryStorage` block is stripped and this falls back to better-auth's in-memory counter (per-instance, resets on restart — fine for a single-instance deploy, not for anything horizontally scaled).

To tighten a specific path (e.g. brute-forcing `/sign-in/email` specifically), add a `customRules` entry — it overrides the default window/max for requests matching that path:

```ts
rateLimit: {
  enabled: true,
  window: 60,
  max: 100,
  storage: "secondary-storage",
  customRules: {
    "/sign-in/email": { window: 60, max: 5 },
  },
},
```

Path keys are better-auth's internal endpoint paths (the same ones served under `/api/auth/*`), not full URLs — check better-auth's docs or `auth.api` for the exact path string of the endpoint you want to constrain.

## Mailer wiring

Two hooks in `lib/auth.ts` call out to the mailer, both inside `MAGIC:mailer` fences (stripped together if the `mailer` module is dropped):

- `emailAndPassword.sendResetPassword({ user, url })` — sends the "reset your password" email.
- `emailVerification.sendVerificationEmail({ user, url })` — sends the "verify your email" email (`emailVerification.sendOnSignUp: true`, so this fires automatically right after registration).

Both just format an HTML string and call `sendMail({ to, subject, html })` from `@/lib/mailer`. `lib/mailer.ts` itself is a provider-agnostic wrapper — `sendMail()` dispatches on `env.MAIL_PROVIDER` (`"resend"` | `"smtp"` | `"console"`, unset falls back to console-logging via `lib/logger.ts`, useful in local dev with no real credentials). This skill doesn't duplicate that logic — if you need to change *which* provider sends the email or its `from` address, that's `MAIL_PROVIDER`/`MAIL_FROM`/`RESEND_API_KEY`/`SMTP_*` in `lib/env.ts` and `.env.example`, not anything in `lib/auth.ts`. The auth-side contract is just: whatever `sendMail()` does, it must resolve for `sendResetPassword`/`sendVerificationEmail` to actually deliver.

## tRPC: `protectedProcedure` vs `publicProcedure`

Defined in `lib/trpc/init.ts`. The tRPC context (`createTRPCContext`) calls `auth.api.getSession({ headers })` once per request and puts the result on `ctx.session` (nullable):

```ts
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } }); // narrows ctx.session to non-null downstream
});
```

- `publicProcedure` — no auth check, `ctx.session` may be `null`. Use for anything world-readable (`postRouter.list`, `postRouter.byId`).
- `protectedProcedure` — throws `UNAUTHORIZED` if there's no session, and **narrows** `ctx.session` to non-null for the rest of the chain — no extra null check needed inside the resolver. `lib/trpc/routers/post.ts` uses this directly:

```ts
create: protectedProcedure
  .input(z.object({ title: z.string().min(1).max(200), content: z.string().max(10_000).optional() }))
  .mutation(({ ctx, input }) =>
    ctx.db.post.create({ data: { ...input, authorId: ctx.session.user.id } }), // no `!` or null check
  ),

delete: protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    await ctx.db.post.delete({ where: { id: input.id, authorId: ctx.session.user.id } });
    return { success: true };
  }),
```

Use `protectedProcedure` for any query/mutation that reads or writes user-owned data; `publicProcedure` otherwise. Never re-derive the session inside a procedure body — it's already on `ctx`.

## `proxy.ts` route guarding

`proxy.ts` (the Next.js 16 replacement for `middleware.ts`) runs on the Node.js runtime, so it can call `auth.api.getSession(...)` directly against Redis/Postgres instead of an internal HTTP round trip. Its `matcher` config is the single source of truth for which paths it inspects:

```ts
const AUTH_ROUTES = ["/login", "/register"];

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/login", "/register"],
};
```

Logic per matched request:

1. Path is `/login` or `/register` **and** a session exists → redirect to `/dashboard` (an already-authed user shouldn't see the auth forms).
2. Any other matched path (i.e. `/dashboard/**`, `/settings/**`) **and no** session → redirect to `/login?redirectTo=<original path>` (the login form reads `redirectTo` to send the user back where they came from after signing in — see `login-form.tsx`'s `redirectTo()` helper).
3. Otherwise → `NextResponse.next()`, request proceeds untouched.

**To protect a new route**, add its pattern to the `matcher` array — nothing else. Because `proxy.ts` already guarantees a session exists for anything matched under `/dashboard/**`/`/settings/**` (i.e. everything under the `app/(app)/**` route group), pages and layouts inside `app/(app)/**` must **never** duplicate the check — no `if (!session) redirect(...)` inside those pages/layouts. That logic lives exclusively in `proxy.ts`; duplicating it just adds a redundant DB/Redis round trip and a second source of truth to keep in sync.

## Adding a new OAuth provider (walkthrough: Discord)

1. **Env vars** — add to `lib/env.ts`'s `server` block, next to the other OAuth pairs:

   ```ts
   DISCORD_CLIENT_ID: z.string().optional(),
   DISCORD_CLIENT_SECRET: z.string().optional(),
   ```

   And to `.env.example` (commented/blank, matching the GitHub/Google convention):

   ```
   DISCORD_CLIENT_ID=""
   DISCORD_CLIENT_SECRET=""
   ```

2. **`socialProviders` entry** in `lib/auth.ts` — same optional-spread shape as Google/GitHub, so a blank env var disables it rather than crashing at boot:

   ```ts
   socialProviders: {
     ...(env.GITHUB_CLIENT_ID ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET! } } : {}),
     ...(env.GOOGLE_CLIENT_ID ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET! } } : {}),
     ...(env.DISCORD_CLIENT_ID ? { discord: { clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET! } } : {}),
   },
   ```

3. **Sign-in call** — same `signIn.social` shape as the existing providers, wired to a button in `login-form.tsx` (or wherever you want the entry point):

   ```ts
   const onDiscordSignIn = async () => {
     await authClient.signIn.social({ provider: "discord", callbackURL: "/dashboard" });
   };
   ```

4. Set `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` in `.env`, register the OAuth app's redirect URI as `<BETTER_AUTH_URL>/api/auth/callback/discord` in Discord's developer portal, done — no other file needs to change (the catch-all route handler and Prisma `Account` model already handle arbitrary `providerId` values).

## Requiring email verification before login

Not currently set — `emailAndPassword` has no `requireEmailVerification` key, so a user can sign in immediately after registering even though `emailVerification.sendOnSignUp: true` fires a verification email in the background. To require verification before login:

```ts
emailAndPassword: {
  enabled: true,
  minPasswordLength: 8,
  autoSignIn: true,
  requireEmailVerification: true, // add this
  sendResetPassword: async ({ user, url }) => { /* unchanged */ },
},
```

This needs the mailer configured and working — `emailVerification.sendVerificationEmail` is the only path a user can get the link needed to verify, and it's the same `MAGIC:mailer`-fenced block already calling `sendMail()` (see Mailer wiring above). If the `mailer` module was dropped from the project, both `emailVerification` and `sendResetPassword` are stripped entirely, so `requireEmailVerification: true` would leave users permanently locked out with no way to verify — don't enable it without a working `MAIL_PROVIDER`.

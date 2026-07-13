import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const FEATURES = [
  { title: "Next.js 16", desc: "App Router, Server Components, Proxy (proxy.ts) route guards." },
  { title: "shadcn/ui + Base UI", desc: "Accessible components built on Base UI primitives, themeable via CSS variables." },
  { title: "better-auth", desc: "Email/password + OAuth, Redis-backed sessions, typed on both client and server." },
  { title: "tRPC + Prisma", desc: "End-to-end type-safe API, Postgres via the Prisma driver adapter." },
  { title: "Redis + MinIO", desc: "Caching, sessions, and S3-compatible object storage — all in docker-compose." },
  { title: "Modular setup", desc: "Run `bun run setup` to pick only the modules you need." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4 md:px-10">
        <span className="font-semibold tracking-tight">Magic Next.js Template</span>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/login" />}>
            Log in
          </Button>
          <Button size="sm" nativeButton={false} render={<Link href="/register" />}>
            Get started
          </Button>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-16 px-6 py-16 text-center md:py-24">
        <div className="flex flex-col items-center gap-6">
          <Badge variant="secondary" className="gap-1.5">
            <Sparkles className="size-3.5" /> Open-source starter
          </Badge>
          <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight md:text-6xl">
            Ship your next app without re-plumbing auth, data, and storage.
          </h1>
          <p className="max-w-xl text-balance text-muted-foreground md:text-lg">
            A modular Next.js template — select the pieces you need at install
            time, keep everything else out of your bundle.
          </p>
          <div className="flex items-center gap-3">
            <Button size="lg" nativeButton={false} render={<Link href="/register" />}>
              Create an account <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/dashboard" />}>
              View dashboard
            </Button>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border bg-card p-5">
              <h3 className="font-medium">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t px-6 py-6 text-center text-sm text-muted-foreground">
        See <code className="rounded bg-muted px-1.5 py-0.5">AGENTS.md</code> for
        the full architecture and conventions.
      </footer>
    </div>
  );
}

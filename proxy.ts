import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Route guard — replaces middleware.ts as of Next.js 16
 * (https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
 * Runs on the Node.js runtime, so `auth.api.getSession` can hit
 * Redis/Postgres directly instead of an internal HTTP round trip.
 *
 * Protected routes: everything under (app) — see the matcher below.
 * Auth routes (/login, /register) redirect an already-authed user to /dashboard.
 */
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

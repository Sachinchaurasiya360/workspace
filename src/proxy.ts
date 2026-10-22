import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth.config";

// Built from the Edge-safe base config only — never import lib/auth here,
// it pulls in Prisma/pg (Node-only) via the Credentials provider's
// `authorize`, which breaks the Edge middleware bundle.
const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = ["/login"];
// Readable signed in or out, without the signed-in redirect away from /login.
const OPEN_ROUTES = ["/roles"];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    nextUrl.pathname.startsWith(route)
  );
  const isSetPasswordRoute = nextUrl.pathname.startsWith("/set-password");

  if (OPEN_ROUTES.some((route) => nextUrl.pathname.startsWith(route))) {
    return NextResponse.next();
  }

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  if (isLoggedIn && req.auth?.user.mustChangePassword && !isSetPasswordRoute) {
    return NextResponse.redirect(new URL("/set-password", nextUrl));
  }

  if (isLoggedIn && !req.auth?.user.mustChangePassword && isPublicRoute) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  return NextResponse.next();
});

// Only the login/set-password gate lives here (cheap, session-only checks).
// Per-row authorization (who can see/edit which task/project) happens in
// each Server Action — see lib/access.ts — never here.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};

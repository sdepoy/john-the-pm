import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistic auth check: verify the session cookie exists before allowing access.
 * Full session validation (DB lookup) happens in each route handler via auth() from auth.ts.
 * This avoids pulling Prisma (Node.js-only) into the Edge runtime.
 *
 * Auth.js v5 with database sessions sets one of these cookies:
 *   - authjs.session-token        (http)
 *   - __Secure-authjs.session-token  (https)
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow auth routes through
  if (
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    const signInUrl = new URL("/auth/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};

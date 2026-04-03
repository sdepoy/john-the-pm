import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Use the lightweight Edge-safe config (no Prisma adapter) for the proxy.
// Full DB-backed auth happens in auth.ts, used by Server Components and Route Handlers.
export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};

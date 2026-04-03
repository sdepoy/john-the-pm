import type { NextAuthConfig } from "next-auth";

/**
 * Lightweight Auth.js config with no database adapter — safe for Edge Runtime (proxy.ts).
 * The full config with Prisma adapter lives in auth.ts and is used in Server Components/Routes.
 */
export const authConfig: NextAuthConfig = {
  providers: [], // providers are only needed server-side
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify-email",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      // Always allow auth routes through
      if (
        pathname.startsWith("/auth/") ||
        pathname.startsWith("/api/auth/")
      ) {
        return true;
      }

      // Require login for everything else
      return isLoggedIn;
    },
  },
};

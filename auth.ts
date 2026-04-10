import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/app/generated/prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma as unknown as PrismaClient),
  trustHost: process.env.NODE_ENV === "development" || process.env.AUTH_TRUST_HOST === "true",
  session: {
    strategy: "database",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // Attach user id to session
      session.user.id = user.id;

      // Check if teamId/teamRole are already cached on any of the user's DB session rows
      const cachedSession = await prisma.session.findFirst({
        where: { userId: user.id, teamId: { not: null } },
        select: { teamId: true, teamRole: true },
      });

      if (cachedSession?.teamId && cachedSession?.teamRole) {
        // Use cached values from session row
        session.user.teamId = cachedSession.teamId;
        session.user.teamRole = cachedSession.teamRole;
      } else {
        // Look up team membership and cache in the session row
        const membership = await prisma.teamMember.findFirst({
          where: { userId: user.id },
          select: { teamId: true, role: true },
        });

        if (membership) {
          session.user.teamId = membership.teamId;
          session.user.teamRole = membership.role;

          // Cache in all DB session rows for this user (future requests won't need to re-query team_members)
          await prisma.session.updateMany({
            where: { userId: user.id },
            data: {
              teamId: membership.teamId,
              teamRole: membership.role,
            },
          });
        }
      }

      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
});

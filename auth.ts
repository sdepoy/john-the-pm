import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/app/generated/prisma/client";

const isDev = process.env.NODE_ENV === "development";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma as unknown as PrismaClient),
  session: {
    strategy: "database",
  },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.RESEND_FROM_EMAIL ?? "John the PM <noreply@johnthepm.app>",
      ...(isDev && {
        sendVerificationRequest({ url, identifier }) {
          console.log(`\n\n🔗 MAGIC LINK for ${identifier}:\n${url}\n\n`);
        },
      }),
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
    verifyRequest: "/auth/verify-email",
  },
});

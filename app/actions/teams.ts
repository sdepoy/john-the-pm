"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function createTeam(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Team name is required");
  }

  const userId = session.user.id;

  // Check user doesn't already have a team
  const existing = await prisma.teamMember.findFirst({ where: { userId } });
  if (existing) {
    redirect("/project");
  }

  // Create team and admin membership in a transaction
  const team = await prisma.team.create({
    data: {
      name: name.trim(),
      members: {
        create: {
          userId,
          role: "admin",
        },
      },
    },
  });

  // Cache team context on all session rows for this user
  await prisma.session.updateMany({
    where: { userId },
    data: {
      teamId: team.id,
      teamRole: "admin",
    },
  });

  redirect("/project");
}

export async function acceptInvitation(invitationId: string, formData: FormData) {
  // formData received but not used — required for Server Action signature
  void formData;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const userId = session.user.id;
  const userEmail = session.user.email;

  // Load and validate invitation
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: { team: true },
  });

  if (!invitation) {
    throw new Error("Invitation not found");
  }

  if (invitation.acceptedAt) {
    throw new Error("This invitation has already been accepted");
  }

  if (invitation.expiresAt < new Date()) {
    throw new Error("This invitation has expired");
  }

  if (invitation.email !== userEmail) {
    throw new Error("This invitation was sent to a different email address");
  }

  // Check user doesn't already have a team
  const existingMembership = await prisma.teamMember.findFirst({ where: { userId } });
  if (existingMembership) {
    redirect("/project");
  }

  await prisma.$transaction([
    // Create team membership
    prisma.teamMember.create({
      data: {
        teamId: invitation.teamId,
        userId,
        role: "member",
      },
    }),
    // Mark invitation as accepted
    prisma.invitation.update({
      where: { id: invitationId },
      data: { acceptedAt: new Date() },
    }),
  ]);

  // Cache team context on session rows
  await prisma.session.updateMany({
    where: { userId },
    data: {
      teamId: invitation.teamId,
      teamRole: "member",
    },
  });

  redirect("/project");
}

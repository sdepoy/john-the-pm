import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const userEmail = session.user.email;

  const hashedToken = hashToken(rawToken);

  const invitation = await prisma.invitation.findUnique({
    where: { token: hashedToken },
    include: { team: true },
  });

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (invitation.acceptedAt) {
    return NextResponse.json({ error: "Invitation has already been accepted" }, { status: 409 });
  }

  if (invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
  }

  if (invitation.email !== userEmail) {
    return NextResponse.json(
      { error: "This invitation was sent to a different email address" },
      { status: 403 }
    );
  }

  // Check user doesn't already belong to a team
  const existingMembership = await prisma.teamMember.findFirst({ where: { userId } });
  if (existingMembership) {
    return NextResponse.json({ error: "User already belongs to a team" }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.teamMember.create({
      data: {
        teamId: invitation.teamId,
        userId,
        role: "member",
      },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
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

  return NextResponse.json({ success: true, teamId: invitation.teamId }, { status: 200 });
}

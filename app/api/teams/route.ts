import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.teamId) {
    return NextResponse.json({ team: null }, { status: 200 });
  }

  const team = await prisma.team.findUnique({
    where: { id: session.user.teamId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  return NextResponse.json({ team });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Check user doesn't already have a team
  const existing = await prisma.teamMember.findFirst({ where: { userId } });
  if (existing) {
    return NextResponse.json({ error: "User already belongs to a team" }, { status: 409 });
  }

  let name: string;
  try {
    const body = await request.json();
    name = body?.name;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  }

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
    include: { members: true },
  });

  // Cache team context in session rows
  await prisma.session.updateMany({
    where: { userId },
    data: {
      teamId: team.id,
      teamRole: "admin",
    },
  });

  return NextResponse.json({ team }, { status: 201 });
}

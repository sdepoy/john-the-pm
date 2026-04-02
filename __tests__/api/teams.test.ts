/**
 * Team management integration tests
 *
 * Tests team creation and membership checks.
 *
 * NOTE: These are integration tests that require a real database connection.
 * Set DATABASE_URL in your test environment before running.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

async function createTestUser(email: string) {
  return prisma.user.create({ data: { email } });
}

async function cleanup(ids: {
  teamIds?: string[];
  userIds?: string[];
}) {
  if (ids.teamIds?.length) {
    // Cascade deletes TeamMember rows via schema onDelete: Cascade
    await prisma.team.deleteMany({ where: { id: { in: ids.teamIds } } });
  }
  if (ids.userIds?.length) {
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }
}

describe("Team creation", () => {
  it("creates a team with the creator as admin", async () => {
    const user = await createTestUser(`creator-${randomUUID()}@test.com`);

    const team = await prisma.team.create({
      data: {
        name: "My Team",
        members: {
          create: { userId: user.id, role: "admin" },
        },
      },
      include: { members: true },
    });

    expect(team.name).toBe("My Team");
    expect(team.members).toHaveLength(1);
    expect(team.members[0].userId).toBe(user.id);
    expect(team.members[0].role).toBe("admin");

    await cleanup({ teamIds: [team.id], userIds: [user.id] });
  });

  it("enforces unique team membership per user per team", async () => {
    const user = await createTestUser(`unique-${randomUUID()}@test.com`);

    const team = await prisma.team.create({
      data: {
        name: "Unique Test Team",
        members: {
          create: { userId: user.id, role: "admin" },
        },
      },
    });

    // Attempting to create a duplicate membership should throw
    await expect(
      prisma.teamMember.create({
        data: { teamId: team.id, userId: user.id, role: "member" },
      })
    ).rejects.toThrow();

    await cleanup({ teamIds: [team.id], userIds: [user.id] });
  });
});

describe("Team membership", () => {
  it("can look up a user's team via TeamMember", async () => {
    const user = await createTestUser(`member-${randomUUID()}@test.com`);

    const team = await prisma.team.create({
      data: {
        name: "Membership Test Team",
        members: {
          create: { userId: user.id, role: "member" },
        },
      },
    });

    const membership = await prisma.teamMember.findFirst({
      where: { userId: user.id },
      select: { teamId: true, role: true },
    });

    expect(membership).not.toBeNull();
    expect(membership!.teamId).toBe(team.id);
    expect(membership!.role).toBe("member");

    await cleanup({ teamIds: [team.id], userIds: [user.id] });
  });

  it("returns null for a user with no team membership", async () => {
    const user = await createTestUser(`no-team-${randomUUID()}@test.com`);

    const membership = await prisma.teamMember.findFirst({
      where: { userId: user.id },
    });

    expect(membership).toBeNull();

    await cleanup({ userIds: [user.id] });
  });

  it("supports multiple members per team with different roles", async () => {
    const admin = await createTestUser(`admin2-${randomUUID()}@test.com`);
    const member = await createTestUser(`member2-${randomUUID()}@test.com`);

    const team = await prisma.team.create({
      data: {
        name: "Multi-member Team",
        members: {
          create: [
            { userId: admin.id, role: "admin" },
            { userId: member.id, role: "member" },
          ],
        },
      },
      include: { members: true },
    });

    expect(team.members).toHaveLength(2);

    const adminMembership = team.members.find((m) => m.userId === admin.id);
    const memberMembership = team.members.find((m) => m.userId === member.id);

    expect(adminMembership?.role).toBe("admin");
    expect(memberMembership?.role).toBe("member");

    await cleanup({ teamIds: [team.id], userIds: [admin.id, member.id] });
  });
});

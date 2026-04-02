/**
 * Project view API — Unit 8 integration tests
 *
 * Tests GET /api/projects/[id] response shape, auth, membership, and 404.
 *
 * NOTE: These are integration tests that require a real database connection.
 * Set DATABASE_URL in your test environment before running.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createTeamWithAdmin() {
  const adminUser = await prisma.user.create({
    data: { email: `admin-pv-${randomUUID()}@test.com` },
  });

  const team = await prisma.team.create({
    data: {
      name: `PV Team ${randomUUID()}`,
      members: {
        create: { userId: adminUser.id, role: "admin" },
      },
    },
  });

  return { team, adminUser };
}

async function createMemberUser(teamId: string) {
  const user = await prisma.user.create({
    data: { email: `member-pv-${randomUUID()}@test.com` },
  });
  await prisma.teamMember.create({
    data: { teamId, userId: user.id, role: "member" },
  });
  return user;
}

async function createOutsiderUser() {
  return prisma.user.create({
    data: { email: `outsider-pv-${randomUUID()}@test.com` },
  });
}

async function createActiveProject(teamId: string) {
  return prisma.project.create({
    data: {
      teamId,
      name: "Test Project",
      objective: "Test objective",
      status: "active",
    },
  });
}

async function cleanup(ids: { teamIds?: string[]; userIds?: string[] }) {
  if (ids.teamIds?.length) {
    await prisma.team.deleteMany({ where: { id: { in: ids.teamIds } } });
  }
  if (ids.userIds?.length) {
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }
}

/**
 * Core project-view logic mirroring GET /api/projects/[id].
 * Returns the response body or throws with a statusCode property.
 */
async function runProjectView(
  projectId: string,
  requestingUserId: string | null
) {
  if (!requestingUserId) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      objective: true,
      status: true,
      context: true,
      plan: true,
      version: true,
      updatedAt: true,
      milestones: {
        select: {
          id: true,
          title: true,
          targetDate: true,
          status: true,
          tasks: {
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              priority: true,
              assigneeId: true,
              assignee: { select: { name: true, email: true } },
              dependsOn: true,
              dueDate: true,
              version: true,
              milestoneId: true,
            },
          },
        },
      },
      tasks: {
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          assigneeId: true,
          assignee: { select: { name: true, email: true } },
          dependsOn: true,
          dueDate: true,
          version: true,
          milestoneId: true,
        },
      },
      team: {
        select: {
          members: {
            select: {
              userId: true,
              role: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });

  if (!project) {
    throw Object.assign(new Error("Not Found"), { statusCode: 404 });
  }

  const isMember = project.team.members.some((m) => m.userId === requestingUserId);
  if (!isMember) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }

  return {
    id: project.id,
    name: project.name,
    objective: project.objective,
    status: project.status,
    context: project.context,
    plan: project.plan,
    version: project.version,
    updatedAt: project.updatedAt.toISOString(),
    milestones: project.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      targetDate: m.targetDate?.toISOString() ?? null,
      status: m.status,
      tasks: m.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        assigneeId: t.assigneeId,
        assignee: t.assignee,
        dependsOn: t.dependsOn,
        dueDate: t.dueDate?.toISOString() ?? null,
        version: t.version,
        milestoneId: t.milestoneId,
      })),
    })),
    tasks: project.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      assigneeId: t.assigneeId,
      assignee: t.assignee,
      dependsOn: t.dependsOn,
      dueDate: t.dueDate?.toISOString() ?? null,
      version: t.version,
      milestoneId: t.milestoneId,
    })),
    teamMembers: project.team.members.map((m) => ({
      userId: m.userId,
      role: m.role,
      user: m.user,
    })),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/projects/[id] — response shape", () => {
  it("returns correct shape with milestones, tasks, and team members", async () => {
    const { team, adminUser } = await createTeamWithAdmin();
    const project = await createActiveProject(team.id);

    // Add a milestone with a task
    const milestone = await prisma.milestone.create({
      data: {
        projectId: project.id,
        title: "M1",
        status: "in_progress",
      },
    });

    await prisma.task.create({
      data: {
        projectId: project.id,
        milestoneId: milestone.id,
        title: "Task 1",
        status: "assigned",
        priority: "high",
        assigneeId: adminUser.id,
        dependsOn: [],
      },
    });

    const response = await runProjectView(project.id, adminUser.id);

    // Top-level fields
    expect(response.id).toBe(project.id);
    expect(response.name).toBe("Test Project");
    expect(response.status).toBe("active");
    expect(typeof response.version).toBe("number");
    expect(typeof response.updatedAt).toBe("string");

    // Milestones
    expect(Array.isArray(response.milestones)).toBe(true);
    expect(response.milestones).toHaveLength(1);
    expect(response.milestones[0].title).toBe("M1");
    expect(Array.isArray(response.milestones[0].tasks)).toBe(true);

    // Tasks (flat)
    expect(Array.isArray(response.tasks)).toBe(true);
    expect(response.tasks).toHaveLength(1);
    expect(response.tasks[0].title).toBe("Task 1");

    // Team members
    expect(Array.isArray(response.teamMembers)).toBe(true);
    expect(response.teamMembers).toHaveLength(1);
    expect(response.teamMembers[0].userId).toBe(adminUser.id);
    expect(response.teamMembers[0].role).toBe("admin");
    expect(response.teamMembers[0].user).toHaveProperty("email");

    await cleanup({ teamIds: [team.id], userIds: [adminUser.id] });
  });
});

describe("GET /api/projects/[id] — authentication", () => {
  it("returns 401 when no user session", async () => {
    const { team, adminUser } = await createTeamWithAdmin();
    const project = await createActiveProject(team.id);

    let statusCode = 0;
    try {
      await runProjectView(project.id, null);
    } catch (err) {
      statusCode = (err as { statusCode: number }).statusCode;
    }

    expect(statusCode).toBe(401);

    await cleanup({ teamIds: [team.id], userIds: [adminUser.id] });
  });
});

describe("GET /api/projects/[id] — authorization", () => {
  it("returns 403 when requesting user is not a team member", async () => {
    const { team, adminUser } = await createTeamWithAdmin();
    const project = await createActiveProject(team.id);
    const outsider = await createOutsiderUser();

    let statusCode = 0;
    try {
      await runProjectView(project.id, outsider.id);
    } catch (err) {
      statusCode = (err as { statusCode: number }).statusCode;
    }

    expect(statusCode).toBe(403);

    await cleanup({
      teamIds: [team.id],
      userIds: [adminUser.id, outsider.id],
    });
  });

  it("allows a team member (non-admin) to view the project", async () => {
    const { team, adminUser } = await createTeamWithAdmin();
    const project = await createActiveProject(team.id);
    const member = await createMemberUser(team.id);

    const response = await runProjectView(project.id, member.id);
    expect(response.id).toBe(project.id);

    await cleanup({
      teamIds: [team.id],
      userIds: [adminUser.id, member.id],
    });
  });
});

describe("GET /api/projects/[id] — not found", () => {
  it("returns 404 for a non-existent project", async () => {
    const { team, adminUser } = await createTeamWithAdmin();

    let statusCode = 0;
    try {
      await runProjectView("non-existent-id", adminUser.id);
    } catch (err) {
      statusCode = (err as { statusCode: number }).statusCode;
    }

    expect(statusCode).toBe(404);

    await cleanup({ teamIds: [team.id], userIds: [adminUser.id] });
  });
});

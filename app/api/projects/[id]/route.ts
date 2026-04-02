import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Extract project id (params is async in Next.js 16)
  const { id } = await params;

  // Load full project state including milestones, tasks, and team members
  const project = await prisma.project.findUnique({
    where: { id },
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
    return new Response("Not Found", { status: 404 });
  }

  // Check membership
  const isMember = project.team.members.some(
    (m) => m.userId === session.user.id
  );
  if (!isMember) {
    return new Response("Forbidden", { status: 403 });
  }

  // Shape response: flatten team members, serialize dates to ISO strings
  const response = {
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

  return Response.json(response);
}

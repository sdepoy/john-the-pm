import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ProjectDashboard from "./ProjectDashboard";
import type { ProjectState } from "@/hooks/useProjectStream";
import type { UIMessage } from "ai";

export default async function ProjectPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const teamId = session.user.teamId;
  if (!teamId) {
    redirect("/onboarding");
  }

  // Find the team's active (non-archived) project
  const project = await prisma.project.findFirst({
    where: { teamId, status: { not: "archived" } },
    orderBy: { updatedAt: "desc" },
  });

  if (!project) {
    redirect("/discovery");
  }

  // Load full project state: milestones + tasks + team members
  const fullProject = await prisma.project.findUnique({
    where: { id: project.id },
    select: {
      id: true,
      name: true,
      objective: true,
      status: true,
      context: true,
      plan: true,
      version: true,
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

  if (!fullProject) {
    redirect("/discovery");
  }

  const initialData: ProjectState = {
    id: fullProject.id,
    name: fullProject.name,
    objective: fullProject.objective,
    status: fullProject.status,
    context: fullProject.context,
    plan: fullProject.plan,
    version: fullProject.version,
    milestones: fullProject.milestones.map((m) => ({
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
    tasks: fullProject.tasks.map((t) => ({
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
    teamMembers: fullProject.team.members.map((m) => ({
      userId: m.userId,
      role: m.role,
      user: m.user,
    })),
  };

  const isAdmin = session.user.teamRole === "admin";
  const userId = session.user.id;

  // Fetch or create thread for member chat panel
  let thread = await prisma.thread.findUnique({
    where: { projectId_userId: { projectId: fullProject.id, userId } },
  });
  if (!thread) {
    thread = await prisma.thread.create({
      data: { projectId: fullProject.id, userId },
    });
  }

  const dbMessages = (await prisma.message.findMany({
    where: { threadId: thread.id, summarized: false },
    orderBy: { createdAt: "desc" },
    take: 20,
  })).reverse();

  const initialMessages: UIMessage[] = dbMessages.map((msg) => ({
    id: msg.id,
    role: msg.role as "user" | "assistant",
    parts: (Array.isArray(msg.content)
      ? (msg.content as Array<{ type: string; text?: string }>)
          .filter((p) => p.type === "text")
          .map((p) => ({ type: "text" as const, text: p.text ?? "" }))
      : []) as UIMessage["parts"],
    createdAt: msg.createdAt,
  }));

  return (
    <ProjectDashboard
      projectId={project.id}
      initialData={initialData}
      isAdmin={isAdmin}
      threadId={thread.id}
      initialMessages={initialMessages}
      userName={session.user.name ?? session.user.email ?? "Team member"}
    />
  );
}

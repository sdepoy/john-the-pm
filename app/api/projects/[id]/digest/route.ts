import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { buildDigestPrompt } from "@/lib/ai/digest";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  // Load project with team membership check
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      context: true,
      teamId: true,
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

  const isMember = project.team.members.some(
    (m) => m.userId === session.user.id
  );
  if (!isMember) {
    return new Response("Forbidden", { status: 403 });
  }

  // Load tasks updated in last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let recentTasks = await prisma.task.findMany({
    where: {
      projectId: id,
      updatedAt: { gte: sevenDaysAgo },
    },
    select: {
      id: true,
      title: true,
      status: true,
      assigneeId: true,
      assignee: { select: { name: true, email: true } },
      updatedAt: true,
    },
  });

  // If fewer than 10 recently updated tasks, load all tasks
  if (recentTasks.length < 10) {
    recentTasks = await prisma.task.findMany({
      where: { projectId: id },
      select: {
        id: true,
        title: true,
        status: true,
        assigneeId: true,
        assignee: { select: { name: true, email: true } },
        updatedAt: true,
      },
    });
  }

  // Group tasks by assignee
  const memberMap = new Map<
    string,
    {
      memberName: string;
      inProgress: string[];
      completed: string[];
      blocked: string[];
    }
  >();

  // Initialize all team members
  for (const member of project.team.members) {
    const name = member.user.name ?? member.user.email;
    memberMap.set(member.userId, {
      memberName: name,
      inProgress: [],
      completed: [],
      blocked: [],
    });
  }

  // Bucket an "unassigned" entry for tasks with no assignee
  memberMap.set("unassigned", {
    memberName: "Unassigned",
    inProgress: [],
    completed: [],
    blocked: [],
  });

  for (const task of recentTasks) {
    const key = task.assigneeId ?? "unassigned";
    if (!memberMap.has(key)) {
      const name = task.assignee?.name ?? task.assignee?.email ?? "Unknown";
      memberMap.set(key, { memberName: name, inProgress: [], completed: [], blocked: [] });
    }
    const entry = memberMap.get(key)!;
    if (task.status === "in_progress") {
      entry.inProgress.push(task.title);
    } else if (task.status === "complete") {
      entry.completed.push(task.title);
    } else if (task.status === "blocked") {
      entry.blocked.push(task.title);
    }
  }

  // Remove members with no tasks
  for (const [key, entry] of memberMap.entries()) {
    if (
      entry.inProgress.length === 0 &&
      entry.completed.length === 0 &&
      entry.blocked.length === 0
    ) {
      memberMap.delete(key);
    }
  }

  const tasksByMember = Array.from(memberMap.values());

  // Extract risks from project context
  const ctx = project.context as {
    risks?: Array<{ milestoneTitle: string; gap: number }>;
  } | null;
  const risks = ctx?.risks ?? [];

  const prompt = buildDigestPrompt(project.name, tasksByMember, risks);

  const { text } = await generateText({
    model: anthropic("claude-haiku-4-5"),
    prompt,
  });

  return Response.json({ digest: text });
}

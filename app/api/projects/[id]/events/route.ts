import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Client } from "pg";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 800;

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function sseComment(comment: string): string {
  return `: ${comment}\n\n`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth check
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Extract project id (params is async in Next.js 16)
  const { id } = await params;

  // 3. Load current project state and check membership
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      milestones: {
        include: {
          tasks: {
            include: {
              assignee: { select: { name: true, email: true } },
            },
          },
        },
      },
      tasks: {
        include: {
          assignee: { select: { name: true, email: true } },
        },
      },
      team: {
        include: {
          members: {
            include: {
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

  // 3b. Check if current user is a member of the project's team
  const isMember = project.team.members.some(
    (m) => m.userId === session.user.id
  );
  if (!isMember) {
    return new Response("Forbidden", { status: 403 });
  }

  // 4. Create a per-connection pg.Client (NOT a module-level singleton)
  const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();

  // 5. LISTEN on the channel for this project (double-quoted for UUID safety)
  await pgClient.query(`LISTEN "project_${id}"`);

  const encoder = new TextEncoder();

  // 6. Create a ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      // Send initial snapshot event
      const snapshotPayload = {
        type: "snapshot",
        project: {
          id: project.id,
          name: project.name,
          objective: project.objective,
          status: project.status,
          version: project.version,
          context: project.context,
          plan: project.plan,
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
        },
      };
      controller.enqueue(encoder.encode(sseEvent(snapshotPayload)));

      // Heartbeat every 25 seconds to prevent proxy/load balancer timeouts
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(sseComment("heartbeat")));
        } catch {
          // Controller may already be closed
        }
      }, 25_000);

      // Listen for pg notifications
      pgClient.on("notification", (msg) => {
        try {
          const payload = msg.payload ? JSON.parse(msg.payload) : {};
          controller.enqueue(
            encoder.encode(sseEvent({ type: "update", ...payload }))
          );
        } catch {
          // Ignore malformed payloads
        }
      });

      // Handle request abort (client disconnect)
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeatInterval);
        pgClient.end().catch(() => {});
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  // 7. Return SSE response
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

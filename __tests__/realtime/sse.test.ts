/**
 * Unit 7 — Real-time Infrastructure
 * Tests for SSE route handler and useProjectStream hook
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock auth module (Unit 2 parallel agent)
jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

// Mock Prisma singleton
jest.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock pg Client
const mockPgClientInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
};
jest.mock("pg", () => ({
  Client: jest.fn(() => mockPgClientInstance),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET as sseGET } from "@/app/api/projects/[id]/events/route";
import type { NextRequest } from "next/server";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_ID = "test-project-id-123";

const makeProject = () => ({
  id: PROJECT_ID,
  name: "Test Project",
  objective: "Ship it",
  status: "active",
  version: 3,
  context: {},
  plan: null,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  milestones: [],
  tasks: [],
  team: {
    members: [
      {
        userId: "user-abc",
        role: "admin",
        user: { name: "Alice", email: "alice@example.com" },
      },
    ],
  },
});

/**
 * Build a minimal NextRequest-like object that the SSE route handler accepts.
 * We use a real AbortController so the signal behaves correctly.
 */
function makeRequest(overrides?: { abortController?: AbortController }) {
  const ac = overrides?.abortController ?? new AbortController();
  return {
    signal: ac.signal,
  } as unknown as NextRequest;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ─── SSE Route Handler Tests ──────────────────────────────────────────────────

describe("GET /api/projects/[id]/events — SSE handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset pg mock
    mockPgClientInstance.connect.mockResolvedValue(undefined);
    mockPgClientInstance.query.mockResolvedValue(undefined);
    mockPgClientInstance.end.mockResolvedValue(undefined);
    mockPgClientInstance.on.mockImplementation(() => undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const req = makeRequest();
    const res = await sseGET(req, makeParams(PROJECT_ID));

    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no user id", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: {} });

    const req = makeRequest();
    const res = await sseGET(req, makeParams(PROJECT_ID));

    expect(res.status).toBe(401);
  });

  it("returns 404 when project does not exist", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-abc" } });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);

    const req = makeRequest();
    const res = await sseGET(req, makeParams(PROJECT_ID));

    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a team member", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "intruder-xyz" } });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(makeProject());

    const req = makeRequest();
    const res = await sseGET(req, makeParams(PROJECT_ID));

    expect(res.status).toBe(403);
  });

  it("happy path: returns text/event-stream with a snapshot event on connect", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-abc" } });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(makeProject());

    const ac = new AbortController();
    const req = makeRequest({ abortController: ac });

    const res = await sseGET(req, makeParams(PROJECT_ID));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    expect(res.headers.get("Connection")).toBe("keep-alive");

    // Verify pg.Client was connected and LISTEN was issued
    expect(mockPgClientInstance.connect).toHaveBeenCalledTimes(1);
    expect(mockPgClientInstance.query).toHaveBeenCalledWith(
      `LISTEN "project_${PROJECT_ID}"`
    );

    // Read the first chunk from the stream (snapshot event)
    const body = res.body!;
    const reader = body.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toMatch(/^data: /);
    const parsed = JSON.parse(text.replace(/^data: /, "").trim()) as {
      type: string;
      project: { id: string };
    };
    expect(parsed.type).toBe("snapshot");
    expect(parsed.project.id).toBe(PROJECT_ID);

    // Abort so the handler cleans up
    ac.abort();
    await reader.cancel();
  });

  it("abort signal fires → pg.Client.end() is called", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-abc" } });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(makeProject());

    const ac = new AbortController();
    const req = makeRequest({ abortController: ac });

    const res = await sseGET(req, makeParams(PROJECT_ID));
    expect(res.body).not.toBeNull();

    // Consume snapshot so the stream is open
    const reader = res.body!.getReader();
    await reader.read();

    // Trigger abort
    ac.abort();

    // Give microtask queue a tick for the abort listener to run
    await new Promise((r) => setTimeout(r, 0));

    expect(mockPgClientInstance.end).toHaveBeenCalledTimes(1);

    await reader.cancel();
  });

  it("connects pg.Client and listens on the correct channel", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-abc" } });
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(makeProject());

    const ac = new AbortController();
    const req = makeRequest({ abortController: ac });

    await sseGET(req, makeParams(PROJECT_ID));

    expect(mockPgClientInstance.connect).toHaveBeenCalledTimes(1);
    expect(mockPgClientInstance.query).toHaveBeenCalledWith(
      `LISTEN "project_${PROJECT_ID}"`
    );

    ac.abort();
  });
});

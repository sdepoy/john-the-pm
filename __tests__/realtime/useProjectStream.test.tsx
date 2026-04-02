/**
 * Unit 7 — useProjectStream hook tests
 * Runs in jsdom environment (see jest.config.ts)
 */

import { renderHook, act } from "@testing-library/react";
import {
  useProjectStream,
  type ProjectState,
} from "@/hooks/useProjectStream";

// ─── Mock EventSource ─────────────────────────────────────────────────────────

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
  onmessage:
    | ((this: EventSource, ev: MessageEvent) => unknown)
    | null = null;
  onerror:
    | ((this: EventSource, ev: Event) => unknown)
    | null = null;
  readyState = 0;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  // Test helpers
  simulateOpen() {
    this.readyState = 1;
    if (this.onopen) this.onopen.call(this as unknown as EventSource, new Event("open"));
  }

  simulateMessage(data: unknown) {
    if (this.onmessage) {
      const event = new MessageEvent("message", {
        data: JSON.stringify(data),
      });
      this.onmessage.call(this as unknown as EventSource, event);
    }
  }

  simulateError() {
    if (this.onerror) this.onerror.call(this as unknown as EventSource, new Event("error"));
  }
}

// Install global mock before tests
beforeAll(() => {
  Object.defineProperty(global, "EventSource", {
    writable: true,
    value: MockEventSource,
  });
});

// Mock fetch for update re-fetching
const mockFetch = jest.fn();
beforeAll(() => {
  global.fetch = mockFetch;
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROJECT_ID = "proj-hook-123";

const makeInitialData = (): ProjectState => ({
  id: PROJECT_ID,
  name: "Initial Project",
  objective: "Initial obj",
  status: "active",
  version: 1,
  context: {},
  plan: null,
  milestones: [],
  tasks: [],
  teamMembers: [],
});

const makeSnapshotData = (): ProjectState => ({
  id: PROJECT_ID,
  name: "Snapshot Project",
  objective: "Snapshot obj",
  status: "active",
  version: 2,
  context: {},
  plan: null,
  milestones: [],
  tasks: [],
  teamMembers: [],
});

const makeFreshStateData = (): ProjectState => ({
  id: PROJECT_ID,
  name: "Fresh Project",
  objective: "Fresh obj",
  status: "complete",
  version: 3,
  context: {},
  plan: null,
  milestones: [],
  tasks: [],
  teamMembers: [],
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useProjectStream hook", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    mockFetch.mockReset();
  });

  it("initializes with initialData before any events", () => {
    const initial = makeInitialData();
    const { result } = renderHook(() =>
      useProjectStream(PROJECT_ID, initial)
    );

    expect(result.current.data).toEqual(initial);
    expect(result.current.error).toBeNull();
    expect(result.current.connected).toBe(false);
  });

  it("creates an EventSource pointing at the events endpoint", () => {
    renderHook(() => useProjectStream(PROJECT_ID, null));

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe(
      `/api/projects/${PROJECT_ID}/events`
    );
  });

  it("sets connected=true on open", () => {
    const { result } = renderHook(() =>
      useProjectStream(PROJECT_ID, null)
    );

    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("handles snapshot event: replaces state entirely", () => {
    const initial = makeInitialData();
    const snapshot = makeSnapshotData();

    const { result } = renderHook(() =>
      useProjectStream(PROJECT_ID, initial)
    );

    act(() => {
      MockEventSource.instances[0].simulateMessage({
        type: "snapshot",
        project: snapshot,
      });
    });

    expect(result.current.data).toEqual(snapshot);
  });

  it("handles update event: re-fetches full state", async () => {
    const freshState = makeFreshStateData();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => freshState,
    });

    const { result } = renderHook(() =>
      useProjectStream(PROJECT_ID, makeInitialData())
    );

    await act(async () => {
      MockEventSource.instances[0].simulateMessage({
        type: "update",
        id: PROJECT_ID,
        version: 3,
        status: "complete",
        updatedAt: 1748889600,
      });
      // Wait for the fetch promise chain
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/projects/${PROJECT_ID}`
    );
    expect(result.current.data).toEqual(freshState);
  });

  it("sets error state when EventSource fires onerror", () => {
    const { result } = renderHook(() =>
      useProjectStream(PROJECT_ID, null)
    );

    act(() => {
      MockEventSource.instances[0].simulateError();
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.connected).toBe(false);
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() =>
      useProjectStream(PROJECT_ID, null)
    );

    const es = MockEventSource.instances[0];
    expect(es.closed).toBe(false);

    unmount();

    expect(es.closed).toBe(true);
  });
});

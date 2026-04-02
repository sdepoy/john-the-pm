"use client";

import { useState, useEffect } from "react";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  assignee: { name: string | null; email: string } | null;
  dependsOn: string[];
  dueDate: string | null;
  version: number;
  milestoneId: string | null;
}

export interface ProjectState {
  id: string;
  name: string;
  objective: string | null;
  status: string;
  version: number;
  context: unknown;
  plan: unknown;
  milestones: Array<{
    id: string;
    title: string;
    targetDate: string | null;
    status: string;
    tasks: Task[];
  }>;
  tasks: Task[];
  teamMembers: Array<{
    userId: string;
    role: string;
    user: { name: string | null; email: string };
  }>;
}

export function useProjectStream(
  projectId: string,
  initialData: ProjectState | null
) {
  const [data, setData] = useState<ProjectState | null>(initialData);
  const [error, setError] = useState<Error | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource(`/api/projects/${projectId}/events`);

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onmessage = (event: MessageEvent) => {
      let parsed: { type: string; project?: ProjectState };
      try {
        parsed = JSON.parse(event.data as string) as {
          type: string;
          project?: ProjectState;
        };
      } catch {
        return;
      }

      if (parsed.type === "snapshot" && parsed.project) {
        setData(parsed.project);
      } else if (parsed.type === "update") {
        // Re-fetch full state on any update — version bump may affect anything
        fetch(`/api/projects/${projectId}`)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json() as Promise<ProjectState>;
          })
          .then((freshState) => {
            setData(freshState);
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err : new Error(String(err)));
          });
      }
    };

    es.onerror = () => {
      setConnected(false);
      setError(new Error("EventSource connection error"));
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [projectId]);

  return { data, error, connected };
}

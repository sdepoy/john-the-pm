"use client";

import type { Task } from "@/hooks/useProjectStream";

interface Milestone {
  id: string;
  title: string;
  targetDate: string | null;
  status: string;
  tasks: Task[];
}

interface MilestoneCardProps {
  milestone: Milestone;
}

function milestoneStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "not_started":
      return { label: "Not Started", className: "bg-gray-100 text-gray-600" };
    case "in_progress":
      return { label: "In Progress", className: "bg-blue-100 text-blue-700" };
    case "at_risk":
      return { label: "At Risk", className: "bg-red-100 text-red-700" };
    case "complete":
      return { label: "Complete", className: "bg-green-100 text-green-700" };
    default:
      return { label: status, className: "bg-gray-100 text-gray-600" };
  }
}

function taskStatusChip(status: string): { label: string; className: string } {
  switch (status) {
    case "unassigned":
      return { label: "Unassigned", className: "bg-gray-100 text-gray-500" };
    case "assigned":
      return { label: "Assigned", className: "bg-slate-100 text-slate-600" };
    case "in_progress":
      return { label: "In Progress", className: "bg-blue-100 text-blue-700" };
    case "blocked":
      return { label: "Blocked", className: "bg-red-100 text-red-700" };
    case "complete":
      return { label: "Complete", className: "bg-green-100 text-green-700" };
    default:
      return { label: status, className: "bg-gray-100 text-gray-500" };
  }
}

function priorityDot(priority: string): string {
  switch (priority) {
    case "high":
      return "bg-red-500";
    case "medium":
      return "bg-yellow-400";
    case "low":
      return "bg-gray-300";
    default:
      return "bg-gray-300";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "No date";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function MilestoneCard({ milestone }: MilestoneCardProps) {
  const badge = milestoneStatusBadge(milestone.status);
  const totalTasks = milestone.tasks.length;
  const completedTasks = milestone.tasks.filter((t) => t.status === "complete").length;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-base font-semibold text-gray-900">{milestone.title}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Target date */}
      <p className="text-xs text-gray-500 mb-3">{formatDate(milestone.targetDate)}</p>

      {/* Progress bar */}
      <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
        <span>Progress</span>
        <span>{completedTasks} / {totalTasks} tasks</span>
      </div>
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-blue-500 transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Task list */}
      {milestone.tasks.length === 0 ? (
        <p className="text-xs text-gray-400">No tasks yet.</p>
      ) : (
        <ul className="space-y-2">
          {milestone.tasks.map((task) => {
            const chip = taskStatusChip(task.status);
            const dot = priorityDot(task.priority);
            const assigneeName =
              task.assignee?.name ?? task.assignee?.email ?? "Unassigned";
            return (
              <li key={task.id} className="flex items-center gap-2 text-sm">
                {/* Priority dot */}
                <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} title={`Priority: ${task.priority}`} />
                {/* Title */}
                <span className="flex-1 truncate text-gray-800">{task.title}</span>
                {/* Status chip */}
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${chip.className}`}>
                  {chip.label}
                </span>
                {/* Assignee */}
                <span className="shrink-0 text-xs text-gray-400 truncate max-w-[80px]">{assigneeName}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

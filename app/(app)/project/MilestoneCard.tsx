"use client";

import { useState } from "react";
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

function assigneeInitials(assignee: { name: string | null; email: string } | null): string {
  if (!assignee) return "";
  const source = assignee.name ?? assignee.email;
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

// Deterministic color from name so the same person always gets the same color
const AVATAR_COLORS = [
  "bg-violet-200 text-violet-800",
  "bg-blue-200 text-blue-800",
  "bg-emerald-200 text-emerald-800",
  "bg-amber-200 text-amber-800",
  "bg-rose-200 text-rose-800",
  "bg-sky-200 text-sky-800",
  "bg-orange-200 text-orange-800",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function TaskRow({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false);
  const chip = taskStatusChip(task.status);
  const dot = priorityDot(task.priority);
  const assigneeName = task.assignee?.name ?? task.assignee?.email ?? "";
  const initials = assigneeInitials(task.assignee);
  const colorClass = assigneeName ? avatarColor(assigneeName) : "";

  return (
    <li className="space-y-0.5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-sm text-left rounded px-1 -mx-1 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 transition-colors"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} title={`Priority: ${task.priority}`} />
        <span className={`flex-1 text-gray-800 ${expanded ? "" : "truncate"}`}>{task.title}</span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${chip.className}`}>
          {chip.label}
        </span>
        {task.assignee && (
          <span
            className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${colorClass}`}
            title={assigneeName}
          >
            {initials}
          </span>
        )}
      </button>
      {expanded && task.description && (
        <p className="pl-4 text-xs text-gray-500 leading-relaxed">{task.description}</p>
      )}
    </li>
  );
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
          {milestone.tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </div>
  );
}

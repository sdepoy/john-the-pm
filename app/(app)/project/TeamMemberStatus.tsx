"use client";

import type { Task } from "@/hooks/useProjectStream";

interface TeamMember {
  userId: string;
  role: string;
  user: { name: string | null; email: string };
  tasks: Task[];
}

interface TeamMemberStatusProps {
  members: TeamMember[];
}

function roleBadge(role: string): { label: string; className: string } {
  switch (role) {
    case "admin":
      return { label: "Admin", className: "bg-purple-100 text-purple-700" };
    default:
      return { label: "Member", className: "bg-gray-100 text-gray-600" };
  }
}

export default function TeamMemberStatus({ members }: TeamMemberStatusProps) {
  if (members.length === 0) {
    return <p className="text-sm text-gray-400">No team members.</p>;
  }

  return (
    <ul className="space-y-3">
      {members.map((member) => {
        const badge = roleBadge(member.role);
        const displayName = member.user.name ?? member.user.email;
        const inProgressTasks = member.tasks.filter((t) => t.status === "in_progress");
        const assignedTasks = member.tasks.filter((t) => t.status === "assigned");
        const blockedTasks = member.tasks.filter((t) => t.status === "blocked");

        return (
          <li
            key={member.userId}
            className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 text-sm">{displayName}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
            <div className="flex gap-4 text-xs text-gray-500">
              <span>{inProgressTasks.length} in progress</span>
              <span>{assignedTasks.length} assigned</span>
              {blockedTasks.length > 0 && (
                <span className="font-semibold text-red-600">
                  {blockedTasks.length} blocked
                </span>
              )}
            </div>
            {blockedTasks.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {blockedTasks.map((t) => (
                  <li key={t.id} className="text-xs text-red-600 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                    {t.title}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import { useState } from "react";
import { useProjectStream, type ProjectState, type Task } from "@/hooks/useProjectStream";
import MilestoneCard from "./MilestoneCard";
import TeamMemberStatus from "./TeamMemberStatus";
import ChatPanel from "./ChatPanel";
import InviteModal from "./InviteModal";
import type { UIMessage } from "ai";

interface ProjectDashboardProps {
  projectId: string;
  initialData: ProjectState;
  isAdmin: boolean;
  threadId: string;
  initialMessages: UIMessage[];
  userName: string;
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "active":
      return { label: "Active", className: "bg-green-100 text-green-700" };
    case "draft":
      return { label: "Draft", className: "bg-yellow-100 text-yellow-700" };
    case "archived":
      return { label: "Archived", className: "bg-gray-100 text-gray-500" };
    default:
      return { label: status, className: "bg-gray-100 text-gray-600" };
  }
}

export default function ProjectDashboard({
  projectId,
  initialData,
  isAdmin,
  threadId,
  initialMessages,
  userName,
}: ProjectDashboardProps) {
  const { data, connected } = useProjectStream(projectId, initialData);

  const [chatOpen, setChatOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [digestOpen, setDigestOpen] = useState(false);

  async function handleGenerateDigest() {
    setDigestLoading(true);
    setDigestError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/digest`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }
      const body = (await res.json()) as { digest: string };
      setDigest(body.digest);
      setDigestOpen(true);
    } catch (err) {
      setDigestError(err instanceof Error ? err.message : "Failed to generate digest");
    } finally {
      setDigestLoading(false);
    }
  }

  // Loading skeleton
  if (!data) {
    return (
      <div className="animate-pulse space-y-4 p-8">
        <div className="h-8 w-64 rounded bg-gray-200" />
        <div className="h-4 w-40 rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="h-40 rounded-xl bg-gray-200" />
          <div className="h-40 rounded-xl bg-gray-200" />
        </div>
      </div>
    );
  }

  const badge = statusBadge(data.status);
  const ctx = data.context as { risks?: Array<{ milestoneTitle: string; gap: number }> } | null;
  const risks = ctx?.risks ?? [];
  const hasRisks = risks.length > 0;

  // Enrich team members with their tasks
  const enrichedMembers = data.teamMembers.map((member) => ({
    ...member,
    tasks: data.tasks.filter((t: Task) => t.assigneeId === member.userId),
  }));

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ── Main content ── */}
      <div className={`flex flex-col flex-1 min-w-0 overflow-y-auto transition-all duration-300`}>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{data.name}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
            {!connected && (
              <span className="text-xs text-gray-400 italic">reconnecting…</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <button
                  onClick={() => setInviteOpen(true)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Invite member
                </button>
                <button
                  onClick={handleGenerateDigest}
                  disabled={digestLoading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {digestLoading ? "Generating…" : "Generate Digest"}
                </button>
              </>
            )}
            <button
              onClick={() => setChatOpen((v) => !v)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 transition-colors ${
                chatOpen
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {chatOpen ? "Close chat" : "Chat with John"}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl w-full px-6 py-6 space-y-6">
        {/* Risk flag banner */}
        {hasRisks && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-800">Active Risks Detected</p>
              <ul className="mt-1 space-y-0.5">
                {risks.map((r, i) => (
                  <li key={i} className="text-sm text-red-700">
                    {r.milestoneTitle}
                    {r.gap !== undefined && (
                      <span className="ml-2 text-xs text-red-500">({r.gap} day gap)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Digest error */}
        {digestError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            Failed to generate digest: {digestError}
          </div>
        )}

        {/* Digest panel */}
        {digestLoading && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4 animate-pulse">
            <div className="h-3.5 w-32 rounded bg-indigo-200 mb-4" />
            <div className="space-y-2">
              <div className="h-2.5 w-full rounded bg-indigo-200" />
              <div className="h-2.5 w-5/6 rounded bg-indigo-200" />
              <div className="h-2.5 w-4/6 rounded bg-indigo-200" />
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-2.5 w-full rounded bg-indigo-200" />
              <div className="h-2.5 w-3/4 rounded bg-indigo-200" />
            </div>
          </div>
        )}
        {digestOpen && digest && !digestLoading && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-indigo-800">Standup Digest</h2>
              <button
                onClick={() => setDigestOpen(false)}
                className="text-xs text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded"
              >
                Close
              </button>
            </div>
            <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap">{digest}</div>
          </div>
        )}

        {/* Milestones */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Milestones</h2>
          {data.milestones.length === 0 ? (
            <p className="text-sm text-gray-400">No milestones yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.milestones.map((milestone) => (
                <MilestoneCard key={milestone.id} milestone={milestone} />
              ))}
            </div>
          )}
        </section>

        {/* Team members */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Team</h2>
          <TeamMemberStatus members={enrichedMembers} />
        </section>
      </div>
      </div>{/* end main content */}

      {/* ── Invite modal ── */}
      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}

      {/* ── Chat panel ── */}
      <div
        className={`flex-shrink-0 border-l border-gray-200 bg-white overflow-hidden transition-all duration-300 ease-in-out ${
          chatOpen ? "w-[30rem]" : "w-0"
        }`}
      >
        <div className="w-[30rem] h-full flex flex-col">
          <ChatPanel
            projectId={projectId}
            threadId={threadId}
            initialMessages={initialMessages}
            userName={userName}
            onClose={() => setChatOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}

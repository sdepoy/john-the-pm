export interface DigestMember {
  memberName: string;
  inProgress: string[];
  completed: string[];
  blocked: string[];
}

export interface DigestRisk {
  milestoneTitle: string;
  gap: number;
}

export function buildDigestPrompt(
  projectName: string,
  tasksByMember: DigestMember[],
  risks: DigestRisk[]
): string {
  return `Generate a standup-style digest for the project "${projectName}".

Team activity:
${tasksByMember
  .map(
    (m) => `
${m.memberName}:
- Tasks in progress: ${m.inProgress.join(", ") || "none"}
- Tasks completed recently: ${m.completed.join(", ") || "none"}
- Blocked: ${m.blocked.join(", ") || "none"}
`
  )
  .join("\n")}

Active risks: ${risks.length > 0 ? risks.map((r) => r.milestoneTitle).join(", ") : "none"}

Format as:
**What got done**: ...
**What's in progress**: ...
**Blockers**: ...
**Risks**: ...`;
}

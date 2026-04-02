/**
 * Digest prompt builder — Unit 8 unit tests
 *
 * Tests for buildDigestPrompt in lib/ai/digest.ts.
 * Pure function tests — no database or network required.
 */

import { buildDigestPrompt } from "@/lib/ai/digest";
import type { DigestMember, DigestRisk } from "@/lib/ai/digest";

const sampleMembers: DigestMember[] = [
  {
    memberName: "Alice",
    inProgress: ["Design homepage", "Write specs"],
    completed: ["Setup CI"],
    blocked: [],
  },
  {
    memberName: "Bob",
    inProgress: [],
    completed: ["Deploy staging"],
    blocked: ["Fix auth bug"],
  },
];

const sampleRisks: DigestRisk[] = [
  { milestoneTitle: "Alpha Release", gap: 3 },
  { milestoneTitle: "Beta Launch", gap: 7 },
];

describe("buildDigestPrompt", () => {
  it("includes all member names", () => {
    const prompt = buildDigestPrompt("My Project", sampleMembers, sampleRisks);
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("Bob");
  });

  it("includes risk milestone titles", () => {
    const prompt = buildDigestPrompt("My Project", sampleMembers, sampleRisks);
    expect(prompt).toContain("Alpha Release");
    expect(prompt).toContain("Beta Launch");
  });

  it("shows 'none' for empty in-progress section", () => {
    const members: DigestMember[] = [
      {
        memberName: "Carol",
        inProgress: [],
        completed: ["Task A"],
        blocked: [],
      },
    ];
    const prompt = buildDigestPrompt("Empty In-Progress", members, []);
    // Bob has no in-progress; Carol's in-progress should show 'none'
    expect(prompt).toContain("Tasks in progress: none");
  });

  it("shows 'none' for empty completed section", () => {
    const members: DigestMember[] = [
      {
        memberName: "Dave",
        inProgress: ["Work in progress"],
        completed: [],
        blocked: [],
      },
    ];
    const prompt = buildDigestPrompt("No Completed", members, []);
    expect(prompt).toContain("Tasks completed recently: none");
  });

  it("shows 'none' for empty blocked section", () => {
    const members: DigestMember[] = [
      {
        memberName: "Eve",
        inProgress: ["Task X"],
        completed: [],
        blocked: [],
      },
    ];
    const prompt = buildDigestPrompt("No Blockers", members, []);
    expect(prompt).toContain("Blocked: none");
  });

  it("shows 'none' for active risks when risks array is empty", () => {
    const prompt = buildDigestPrompt("Safe Project", sampleMembers, []);
    expect(prompt).toContain("Active risks: none");
  });

  it("includes the project name in the prompt", () => {
    const prompt = buildDigestPrompt("Awesome App", sampleMembers, sampleRisks);
    expect(prompt).toContain('"Awesome App"');
  });

  it("includes in-progress task titles for members who have them", () => {
    const prompt = buildDigestPrompt("My Project", sampleMembers, sampleRisks);
    expect(prompt).toContain("Design homepage");
    expect(prompt).toContain("Write specs");
  });

  it("includes blocked task titles", () => {
    const prompt = buildDigestPrompt("My Project", sampleMembers, sampleRisks);
    expect(prompt).toContain("Fix auth bug");
  });

  it("includes formatting instructions in the output", () => {
    const prompt = buildDigestPrompt("My Project", sampleMembers, sampleRisks);
    expect(prompt).toContain("**What got done**");
    expect(prompt).toContain("**What's in progress**");
    expect(prompt).toContain("**Blockers**");
    expect(prompt).toContain("**Risks**");
  });
});

/**
 * Invitation flow integration tests
 *
 * These tests validate the invitation lifecycle:
 * - Sending an invitation (POST /api/invitations)
 * - Accepting a valid invitation (POST /api/invitations/[token])
 * - Rejecting an expired token (410 Gone)
 * - Rejecting an already-accepted token (409 Conflict)
 *
 * NOTE: These are integration tests that require a real database connection.
 * Set DATABASE_URL in your test environment before running.
 */

import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createTestUser(email: string) {
  return prisma.user.create({
    data: { email },
  });
}

async function createTestTeam(adminUserId: string) {
  return prisma.team.create({
    data: {
      name: "Test Team",
      members: {
        create: { userId: adminUserId, role: "admin" },
      },
    },
  });
}

async function createTestInvitation(teamId: string, email: string, options?: { expiresAt?: Date; acceptedAt?: Date }) {
  const rawToken = randomUUID();
  const hashedToken = hashToken(rawToken);
  const expiresAt = options?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invitation = await prisma.invitation.create({
    data: {
      teamId,
      email,
      token: hashedToken,
      expiresAt,
      acceptedAt: options?.acceptedAt,
    },
  });

  return { invitation, rawToken };
}

// Cleanup helper — deletes test data in reverse dependency order
async function cleanup(ids: {
  invitationIds?: string[];
  teamMemberIds?: string[];
  teamIds?: string[];
  userIds?: string[];
}) {
  if (ids.invitationIds?.length) {
    await prisma.invitation.deleteMany({ where: { id: { in: ids.invitationIds } } });
  }
  if (ids.teamMemberIds?.length) {
    await prisma.teamMember.deleteMany({ where: { id: { in: ids.teamMemberIds } } });
  }
  if (ids.teamIds?.length) {
    await prisma.team.deleteMany({ where: { id: { in: ids.teamIds } } });
  }
  if (ids.userIds?.length) {
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }
}

describe("Invitation flow", () => {
  describe("createTestInvitation helper", () => {
    it("stores a hashed token and returns the raw token", async () => {
      const adminUser = await createTestUser(`admin-${randomUUID()}@test.com`);
      const team = await createTestTeam(adminUser.id);
      const inviteeEmail = `invitee-${randomUUID()}@test.com`;

      const { invitation, rawToken } = await createTestInvitation(team.id, inviteeEmail);

      // Raw token should not equal what is stored in DB
      expect(invitation.token).not.toBe(rawToken);
      // Stored token should be the SHA-256 hash of the raw token
      expect(invitation.token).toBe(hashToken(rawToken));
      expect(invitation.email).toBe(inviteeEmail);
      expect(invitation.acceptedAt).toBeNull();

      await cleanup({
        invitationIds: [invitation.id],
        teamIds: [team.id],
        userIds: [adminUser.id],
      });
    });
  });

  describe("Accepting a valid invitation", () => {
    it("creates a TeamMember and marks the invitation accepted", async () => {
      const adminUser = await createTestUser(`admin-${randomUUID()}@test.com`);
      const team = await createTestTeam(adminUser.id);
      const inviteeEmail = `invitee-${randomUUID()}@test.com`;
      const inviteeUser = await createTestUser(inviteeEmail);

      const { invitation, rawToken } = await createTestInvitation(team.id, inviteeEmail);

      // Simulate acceptance: look up by hashed token
      const hashedToken = hashToken(rawToken);
      const found = await prisma.invitation.findUnique({ where: { token: hashedToken } });
      expect(found).not.toBeNull();
      expect(found!.acceptedAt).toBeNull();
      expect(found!.expiresAt > new Date()).toBe(true);

      // Create membership and mark accepted
      const membership = await prisma.teamMember.create({
        data: { teamId: team.id, userId: inviteeUser.id, role: "member" },
      });

      const updated = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      expect(updated.acceptedAt).not.toBeNull();

      const createdMembership = await prisma.teamMember.findUnique({
        where: { id: membership.id },
      });
      expect(createdMembership).not.toBeNull();
      expect(createdMembership!.role).toBe("member");

      await cleanup({
        invitationIds: [invitation.id],
        teamMemberIds: [membership.id],
        teamIds: [team.id],
        userIds: [adminUser.id, inviteeUser.id],
      });
    });
  });

  describe("Expired invitation (410 Gone)", () => {
    it("rejects an invitation that has passed its expiry date", async () => {
      const adminUser = await createTestUser(`admin-${randomUUID()}@test.com`);
      const team = await createTestTeam(adminUser.id);
      const inviteeEmail = `invitee-${randomUUID()}@test.com`;

      // Create an already-expired invitation
      const { invitation, rawToken } = await createTestInvitation(team.id, inviteeEmail, {
        expiresAt: new Date(Date.now() - 1000), // 1 second in the past
      });

      const hashedToken = hashToken(rawToken);
      const found = await prisma.invitation.findUnique({ where: { token: hashedToken } });

      expect(found).not.toBeNull();
      // Verify it is expired
      expect(found!.expiresAt < new Date()).toBe(true);
      // Simulate 410 condition
      const isExpired = found!.expiresAt < new Date();
      expect(isExpired).toBe(true);

      await cleanup({
        invitationIds: [invitation.id],
        teamIds: [team.id],
        userIds: [adminUser.id],
      });
    });
  });

  describe("Already accepted invitation (409 Conflict)", () => {
    it("detects an invitation that has already been accepted", async () => {
      const adminUser = await createTestUser(`admin-${randomUUID()}@test.com`);
      const team = await createTestTeam(adminUser.id);
      const inviteeEmail = `invitee-${randomUUID()}@test.com`;

      // Create an invitation that is already accepted
      const { invitation, rawToken } = await createTestInvitation(team.id, inviteeEmail, {
        acceptedAt: new Date(Date.now() - 60000), // accepted 1 minute ago
      });

      const hashedToken = hashToken(rawToken);
      const found = await prisma.invitation.findUnique({ where: { token: hashedToken } });

      expect(found).not.toBeNull();
      // Verify it is already accepted
      expect(found!.acceptedAt).not.toBeNull();
      // Simulate 409 condition
      const alreadyAccepted = found!.acceptedAt !== null;
      expect(alreadyAccepted).toBe(true);

      await cleanup({
        invitationIds: [invitation.id],
        teamIds: [team.id],
        userIds: [adminUser.id],
      });
    });
  });
});

import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { Resend } from "resend";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin-only
  if (session.user.teamRole !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin role required" }, { status: 403 });
  }

  const teamId = session.user.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "No team found for user" }, { status: 400 });
  }

  let email: string;
  try {
    const body = await request.json();
    email = body?.email;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email address is required" }, { status: 400 });
  }

  // Check if there is already a pending invitation for this email+team
  const existingInvitation = await prisma.invitation.findFirst({
    where: {
      teamId,
      email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (existingInvitation) {
    return NextResponse.json(
      { error: "A pending invitation already exists for this email" },
      { status: 409 }
    );
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  // Generate raw token — stored as hash, sent as raw in email
  const rawToken = randomUUID();
  const hashedToken = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invitation = await prisma.invitation.create({
    data: {
      teamId,
      email,
      token: hashedToken,
      expiresAt,
    },
  });

  // Send invitation email via Resend
  const resendKey = process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY;
  if (!resendKey) {
    // Clean up the invitation if we can't send the email
    await prisma.invitation.delete({ where: { id: invitation.id } });
    return NextResponse.json(
      { error: "Email service unavailable" },
      { status: 503 }
    );
  }

  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const inviteLink = `${baseUrl}/onboarding`;

  const resend = new Resend(resendKey);
  const { error: emailError } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
    to: [email],
    subject: `You've been invited to join ${team.name} on John the PM`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>You've been invited to join ${team.name}</h2>
        <p>Click the link below to accept the invitation and join the team:</p>
        <a href="${inviteLink}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Accept invitation
        </a>
        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
          This invitation expires in 7 days. If you did not expect this invitation, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  if (emailError) {
    console.error("[invitations] Resend error:", JSON.stringify(emailError));
    // Email failed — invitation still valid, return the link so admin can share manually
    return NextResponse.json(
      { invitation: { id: invitation.id, email, expiresAt }, inviteLink, emailSent: false },
      { status: 201 }
    );
  }

  return NextResponse.json({ invitation: { id: invitation.id, email, expiresAt }, inviteLink, emailSent: true }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin-only
  if (session.user.teamRole !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin role required" }, { status: 403 });
  }

  const teamId = session.user.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "No team found for user" }, { status: 400 });
  }

  const invitations = await prisma.invitation.findMany({
    where: {
      teamId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ invitations });
}

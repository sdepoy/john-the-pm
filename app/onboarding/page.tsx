import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createTeam, acceptInvitation } from "@/app/actions/teams";

export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  // If user already has a team, send to project
  if (session.user.teamId) {
    redirect("/project");
  }

  const userEmail = session.user.email ?? "";

  // Check for a pending invitation
  const invitation = await prisma.invitation.findFirst({
    where: {
      email: userEmail,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { team: true },
  });

  if (invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">You&apos;ve been invited!</h1>
            <p className="mt-2 text-gray-500">
              You&apos;ve been invited to join{" "}
              <span className="font-semibold text-gray-800">{invitation.team.name}</span>
            </p>
          </div>

          <form
            action={acceptInvitation.bind(null, invitation.id)}
            className="space-y-4"
          >
            <p className="text-sm text-gray-500 text-center">
              Signing in as <span className="font-medium text-gray-700">{userEmail}</span>
            </p>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
            >
              Accept invitation and join {invitation.team.name}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // No invitation — show create team form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Create your team</h1>
          <p className="mt-2 text-sm text-gray-500">
            Give your team a name to get started with John the PM
          </p>
        </div>

        <form action={createTeam} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Team name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Acme Engineering"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
          >
            Create team
          </button>
        </form>
      </div>
    </div>
  );
}

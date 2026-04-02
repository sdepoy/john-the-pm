import Link from "next/link";

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Check your inbox</h1>
        <p className="text-gray-500 mb-6">
          A magic link has been sent to your email address. Click the link to
          complete sign-in. The link expires in 24 hours.
        </p>

        <div className="text-sm text-gray-500">
          Didn&apos;t receive an email?{" "}
          <Link
            href="/auth/signin"
            className="text-indigo-600 hover:text-indigo-500 underline font-medium"
          >
            Request a new one
          </Link>
        </div>
      </div>
    </div>
  );
}

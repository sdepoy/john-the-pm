import { handlers } from "@/auth";
import type { NextRequest } from "next/server";

// Wrap Auth.js handlers to satisfy Next.js 16's stricter route handler signature
// (Next.js 16 passes a context object as the second arg; Auth.js beta.30 doesn't declare it)
export async function GET(req: NextRequest) {
  return handlers.GET(req);
}

export async function POST(req: NextRequest) {
  return handlers.POST(req);
}

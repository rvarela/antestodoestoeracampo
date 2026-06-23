import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Internal editorial tools (/research, /triage) are local-only. In production
// they (and their server-action POSTs, which hit the same paths) return 404, so
// the open approve/hide endpoints are never reachable on the public site. On
// `npm run dev` NODE_ENV is "development", so they work normally on localhost.
export function middleware(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/research/:path*", "/research", "/triage/:path*", "/triage"],
};

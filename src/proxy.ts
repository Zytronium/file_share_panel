import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE, verifySessionToken } from "./lib/session"

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/files", "/api/upload-url", "/api/share", "/api/delete"],
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const valid = token ? await verifySessionToken(token) : false

  if (valid) {
    return NextResponse.next()
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  return NextResponse.redirect(new URL("/login", request.url))
}

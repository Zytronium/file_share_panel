import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { createSessionToken, SESSION_COOKIE } from "@/lib/session"

export async function POST(request: Request) {
  const { password } = await request.json()
  const hash = process.env.ADMIN_PASSWORD_HASH
  if (!hash)
    console.warn("no password hash stored");
  else
    console.log(hash);
  console.log("hash length:", hash?.length, JSON.stringify(hash))

  if (!hash || !password) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 })
  }

  const valid = await bcrypt.compare(password, hash)
  if (!valid) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 })
  }

  const token = await createSessionToken()
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}

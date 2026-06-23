import { NextResponse } from "next/server"
import { nanoid } from "nanoid"
import { redis } from "@/lib/redis"

export async function POST(request: Request) {
  const { key, expiresInDays } = await request.json()

  if (!key) {
    return NextResponse.json({ error: "Missing file key" }, { status: 400 })
  }

  // For permanent shares (no expiry), reuse the existing token if one exists
  if (!expiresInDays || expiresInDays <= 0) {
    const existingToken = await redis.get<string>(`permalink:${key}`)
    if (existingToken) {
      return NextResponse.json({ token: existingToken })
    }
  }

  const token = nanoid(12)

  if (expiresInDays && expiresInDays > 0) {
    await redis.set(`share:${token}`, key, { ex: expiresInDays * 86400 })
  } else {
    await redis.set(`share:${token}`, key)
    // Store as the permanent link for this file
    await redis.set(`permalink:${key}`, token)
  }

  await redis.sadd(`shares-for:${key}`, token)

  return NextResponse.json({ token })
}

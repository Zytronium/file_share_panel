import { NextResponse } from "next/server"
import { nanoid } from "nanoid"
import { redis } from "@/lib/redis"

export async function POST(request: Request) {
  const { key, expiresInDays } = await request.json()

  if (!key) {
    return NextResponse.json({ error: "Missing file key" }, { status: 400 })
  }

  const token = nanoid(12)

  if (expiresInDays && expiresInDays > 0) {
    await redis.set(`share:${token}`, key, { ex: expiresInDays * 86400 })
  } else {
    await redis.set(`share:${token}`, key)
  }

  await redis.sadd(`shares-for:${key}`, token)

  return NextResponse.json({ token })
}

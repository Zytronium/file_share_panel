import { NextResponse } from "next/server"
import { DeleteObjectCommand } from "@aws-sdk/client-s3"
import { r2, BUCKET } from "@/lib/r2"
import { redis } from "@/lib/redis"

export async function POST(request: Request) {
  const { key } = await request.json()

  if (!key) {
    return NextResponse.json({ error: "Missing file key" }, { status: 400 })
  }

  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))

  const tokens = await redis.smembers(`shares-for:${key}`)
  if (tokens.length > 0) {
    await Promise.all(tokens.map((token) => redis.del(`share:${token}`)))
    await redis.del(`shares-for:${key}`)
  }

  return NextResponse.json({ ok: true })
}

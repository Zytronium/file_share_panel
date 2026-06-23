import { NextResponse } from "next/server"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { r2, BUCKET } from "@/lib/r2"
import { redis } from "@/lib/redis"

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const key = await redis.get<string>(`share:${token}`)

  if (!key) {
    return new NextResponse("This link has expired or does not exist.", { status: 404 })
  }

  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  const url = await getSignedUrl(r2, command, { expiresIn: 300 })

  return NextResponse.redirect(url)
}

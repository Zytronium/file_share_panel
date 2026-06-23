import { NextResponse } from "next/server"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { r2, BUCKET } from "@/lib/r2"

export async function POST(request: Request) {
  const { key } = await request.json()

  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 })
  }

  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  const url = await getSignedUrl(r2, command, { expiresIn: 300 })

  return NextResponse.json({ url })
}

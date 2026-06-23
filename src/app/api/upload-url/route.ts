import { NextResponse } from "next/server"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { nanoid } from "nanoid"
import { r2, BUCKET } from "@/lib/r2"

export async function POST(request: Request) {
  const { filename, contentType } = await request.json()

  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 })
  }

  const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_")
  const key = `${Date.now()}-${nanoid(6)}-${safeName}`

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType || "application/octet-stream",
  })

  const url = await getSignedUrl(r2, command, { expiresIn: 600 })

  return NextResponse.json({ url, key })
}

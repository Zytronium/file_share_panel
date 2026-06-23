import { NextResponse } from "next/server"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { r2, BUCKET } from "@/lib/r2"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get("key")

  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 })
  }

  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
    const url = await getSignedUrl(r2, command, { expiresIn: 300 })
    return NextResponse.json({ url })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Could not generate preview URL" }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { ListObjectsV2Command } from "@aws-sdk/client-s3"
import { r2, BUCKET } from "@/lib/r2"

export async function GET() {
  try {
    const result = await r2.send(new ListObjectsV2Command({ Bucket: BUCKET }))

    const files = (result.Contents ?? [])
      .filter((item) => item.Key && !item.Key.endsWith("/"))
      .map((item) => ({
        key: item.Key as string,
        size: item.Size ?? 0,
        lastModified: item.LastModified,
      }))
      .sort((a, b) => {
        const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0
        const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0
        return bTime - aTime
      })

    return NextResponse.json({ files })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Could not list files" }, { status: 500 })
  }
}

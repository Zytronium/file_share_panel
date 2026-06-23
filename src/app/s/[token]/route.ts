import { NextResponse } from "next/server"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { r2, BUCKET } from "@/lib/r2"
import { redis } from "@/lib/redis"

interface SinceUploadSlot {
  fileKey: string
  durationMinutes: number // 0 on the last slot means "forever"
}

interface TimeOfDaySlot {
  fileKey: string
  startTime: string // "HH:MM"
  endTime: string   // "HH:MM" — may be < startTime to indicate crossing midnight
}

interface Schedule {
  mode: "since-upload" | "time-of-day"
  timezone?: string // for time-of-day mode, e.g. "America/New_York"
  uploadedAt?: number // unix ms, for since-upload mode
  slots: SinceUploadSlot[] | TimeOfDaySlot[]
}

function resolveKey(schedule: Schedule, now: Date, originalKey: string): string {
  if (schedule.mode === "since-upload") {
    const slots = schedule.slots as SinceUploadSlot[]
    if (!schedule.uploadedAt) return originalKey
    const elapsedMinutes = (now.getTime() - schedule.uploadedAt) / 60000
    let consumed = 0
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      const isLast = i === slots.length - 1
      const windowEnd = consumed + slot.durationMinutes
      if (isLast || elapsedMinutes < windowEnd) return slot.fileKey
      consumed = windowEnd
    }
    return originalKey
  }

  if (schedule.mode === "time-of-day") {
    const slots = schedule.slots as TimeOfDaySlot[]
    const tz = schedule.timezone ?? "UTC"
    const localStr = now.toLocaleString("en-US", { timeZone: tz, hour12: false,
      hour: "2-digit", minute: "2-digit" })
    // toLocaleString with hour12:false can return "24:xx" for midnight — normalise
    const [hStr, mStr] = localStr.replace(/^24:/, "00:").split(":")
    const nowMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10)

    for (const slot of slots) {
      const [sh, sm] = slot.startTime.split(":").map(Number)
      const [eh, em] = slot.endTime.split(":").map(Number)
      const start = sh * 60 + sm
      const end = eh * 60 + em
      if (start <= end) {
        if (nowMinutes >= start && nowMinutes < end) return slot.fileKey
      } else {
        // crosses midnight
        if (nowMinutes >= start || nowMinutes < end) return slot.fileKey
      }
    }
    return originalKey
  }

  return originalKey
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const originalKey = await redis.get<string>(`share:${token}`)

  if (!originalKey) {
    return new NextResponse("This link has expired or does not exist.", { status: 404 })
  }

  const schedule = await redis.get<Schedule>(`schedule:${token}`)

  const fileKey = schedule ? resolveKey(schedule, new Date(), originalKey) : originalKey

  const command = new GetObjectCommand({ Bucket: BUCKET, Key: fileKey })
  const url = await getSignedUrl(r2, command, { expiresIn: 300 })

  return NextResponse.redirect(url)
}

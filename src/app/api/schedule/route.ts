import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"

// A schedule is attached to a share token and defines which file key to serve when.
//
// Two modes:
//
// "since-upload": windows are durations (in minutes) after the file was first uploaded.
//   slots: [{ fileKey, durationMinutes }, ...]   (last slot serves forever)
//
// "time-of-day": recurring daily windows defined by HH:MM start/end in a given timezone.
//   slots: [{ fileKey, startTime: "HH:MM", endTime: "HH:MM" }, ...]
//   Slots must be non-overlapping. Gaps serve the token's original file.
//
// The schedule is stored at  schedule:<token>  as a JSON string.

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 })

    const raw = await redis.get<string>(`schedule:${token}`)
    return NextResponse.json({ schedule: raw ? JSON.parse(raw) : null })
}

export async function POST(request: Request) {
    const body = await request.json()
    const { token, schedule } = body
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 })

    if (schedule === null) {
        await redis.del(`schedule:${token}`)
    } else {
        await redis.set(`schedule:${token}`, JSON.stringify(schedule))
    }

    return NextResponse.json({ ok: true })
}

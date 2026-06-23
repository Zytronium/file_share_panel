"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileItem {
  key: string
  size: number
  lastModified?: string
}

interface SinceUploadSlot {
  fileKey: string
  durationMinutes: number
}

interface TimeOfDaySlot {
  fileKey: string
  startTime: string // "HH:MM"
  endTime: string   // "HH:MM"
}

type ScheduleMode = "since-upload" | "time-of-day"

interface Schedule {
  mode: ScheduleMode
  timezone?: string
  uploadedAt?: number
  slots: SinceUploadSlot[] | TimeOfDaySlot[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function displayName(key: string) {
  return key.replace(/^\d+-[a-zA-Z0-9_-]{6}-/, "")
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function getMediaType(key: string): "image" | "gif" | "video" | null {
  const ext = key.split(".").pop()?.toLowerCase() ?? ""
  if (ext === "gif") return "gif"
  if (["jpg", "jpeg", "png", "webp", "avif", "svg"].includes(ext)) return "image"
  if (["mp4", "webm", "mov", "mkv", "avi", "m4v"].includes(ext)) return "video"
  return null
}

function minutesToLabel(m: number): string {
  if (m < 60) return `${m}m`
  if (m < 1440) return `${m / 60}h`
  return `${m / 1440}d`
}

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
]

// ---------------------------------------------------------------------------
// Media thumbnail + lightbox (unchanged from before)
// ---------------------------------------------------------------------------

function MediaThumbnail({ file, onClick }: { file: FileItem; onClick: () => void }) {
  const mediaType = getMediaType(file.key)
  const [src, setSrc] = useState<string | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (!mediaType) return
    fetch(`/api/preview?key=${encodeURIComponent(file.key)}`)
        .then((r) => r.json())
        .then((d) => setSrc(d.url))
        .catch(() => setErr(true))
  }, [file.key, mediaType])

  if (!mediaType) return null
  if (err) return <span className="thumb-placeholder">?</span>
  if (!src) return <span className="thumb-placeholder thumb-loading" />

  if (mediaType === "video") {
    return (
        <button className="thumb-btn" onClick={onClick} aria-label="Preview video">
          <video
              src={src}
              className="thumb-media"
              muted
              preload="metadata"
              onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
              onMouseLeave={(e) => {
                const v = e.currentTarget as HTMLVideoElement
                v.pause()
                v.currentTime = 0
              }}
          />
          <span className="thumb-play-badge">▶</span>
        </button>
    )
  }

  return (
      <button className="thumb-btn" onClick={onClick} aria-label="Preview image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={displayName(file.key)} className="thumb-media" />
      </button>
  )
}

function LightboxModal({ file, onClose }: { file: FileItem; onClose: () => void }) {
  const mediaType = getMediaType(file.key)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/preview?key=${encodeURIComponent(file.key)}`)
        .then((r) => r.json())
        .then((d) => setSrc(d.url))
  }, [file.key])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
      <div className="lightbox-backdrop" onClick={onClose}>
        <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
          <button className="lightbox-close" onClick={onClose} aria-label="Close">✕</button>
          <p className="lightbox-name">{displayName(file.key)}</p>
          {!src ? (
              <div className="lightbox-loading">Loading...</div>
          ) : mediaType === "video" ? (
              <video src={src} controls autoPlay className="lightbox-media" />
          ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={displayName(file.key)} className="lightbox-media" />
          )}
        </div>
      </div>
  )
}

// ---------------------------------------------------------------------------
// Temp share modal
// ---------------------------------------------------------------------------

const TEMP_DURATIONS = [
  { label: "1 hour",  days: 1 / 24 },
  { label: "6 hours", days: 6 / 24 },
  { label: "1 day",   days: 1 },
  { label: "3 days",  days: 3 },
  { label: "7 days",  days: 7 },
  { label: "30 days", days: 30 },
]

function TempShareModal({
                          file, onClose, onCopied,
                        }: {
  file: FileItem; onClose: () => void; onCopied: (msg: string) => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  async function handleGenerate() {
    if (selected === null) return
    setLoading(true)
    const days = TEMP_DURATIONS[selected].days
    const response = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: file.key, expiresInDays: days }),
    })
    setLoading(false)
    if (!response.ok) { onCopied("Could not create link"); onClose(); return }
    const { token } = await response.json()
    const shareUrl = `${window.location.origin}/s/${token}`
    await navigator.clipboard.writeText(shareUrl)
    onCopied(`Temp link copied -- expires in ${TEMP_DURATIONS[selected].label}`)
    onClose()
  }

  return (
      <div className="lightbox-backdrop" onClick={onClose}>
        <div className="temp-share-modal" onClick={(e) => e.stopPropagation()}>
          <button className="lightbox-close" onClick={onClose} aria-label="Close">✕</button>
          <p className="eyebrow">Temp link</p>
          <h2 className="temp-share-title">How long should the link last?</h2>
          <p className="temp-share-file">{displayName(file.key)}</p>
          <div className="duration-grid">
            {TEMP_DURATIONS.map((d, i) => (
                <button
                    key={d.label}
                    className={`duration-btn${selected === i ? " selected" : ""}`}
                    onClick={() => setSelected(i)}
                >{d.label}</button>
            ))}
          </div>
          <button className="generate-btn" onClick={handleGenerate} disabled={selected === null || loading}>
            {loading ? "Generating..." : "Copy link"}
          </button>
        </div>
      </div>
  )
}

// ---------------------------------------------------------------------------
// Schedule editor modal
// ---------------------------------------------------------------------------

function FileSelect({ value, files, onChange }: {
  value: string; files: FileItem[]; onChange: (k: string) => void
}) {
  return (
      <select className="sched-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">-- pick a file --</option>
        {files.map((f) => (
            <option key={f.key} value={f.key}>{displayName(f.key)}</option>
        ))}
      </select>
  )
}

// Duration picker: value in minutes, shows a number input + unit selector
function DurationPicker({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  const units = [
    { label: "minutes", factor: 1 },
    { label: "hours",   factor: 60 },
    { label: "days",    factor: 1440 },
  ]
  // pick the best unit
  const [unit, setUnit] = useState(() => {
    if (value % 1440 === 0) return 2
    if (value % 60 === 0) return 1
    return 0
  })
  const displayVal = value / units[unit].factor

  function handleNumChange(n: number) {
    onChange(Math.max(1, Math.round(n)) * units[unit].factor)
  }
  function handleUnitChange(u: number) {
    setUnit(u)
    onChange(Math.max(1, Math.round(displayVal)) * units[u].factor)
  }

  return (
      <div className="duration-picker">
        <input
            type="number"
            className="sched-num-input"
            min={1}
            value={displayVal}
            onChange={(e) => handleNumChange(Number(e.target.value))}
        />
        <select className="sched-select sched-select-sm" value={unit} onChange={(e) => handleUnitChange(Number(e.target.value))}>
          {units.map((u, i) => <option key={u.label} value={i}>{u.label}</option>)}
        </select>
      </div>
  )
}

function TimePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
      <div className="time-picker-group">
        <span className="time-picker-label">{label}</span>
        <input
            type="time"
            className="sched-time-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
      </div>
  )
}

function ScheduleEditorModal({
                               token, originalKey, files, onClose, onSaved,
                             }: {
  token: string
  originalKey: string
  files: FileItem[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [mode, setMode] = useState<ScheduleMode>("since-upload")
  const [timezone, setTimezone] = useState("UTC")
  const [sinceSlots, setSinceSlots] = useState<SinceUploadSlot[]>([
    { fileKey: originalKey, durationMinutes: 60 },
    { fileKey: "", durationMinutes: 0 },
  ])
  const [todSlots, setTodSlots] = useState<TimeOfDaySlot[]>([
    { fileKey: originalKey, startTime: "08:00", endTime: "20:00" },
  ])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  // Load existing schedule if any
  useEffect(() => {
    fetch(`/api/schedule?token=${encodeURIComponent(token)}`)
        .then((r) => r.json())
        .then(({ schedule }) => {
          if (schedule) {
            setMode(schedule.mode)
            if (schedule.timezone) setTimezone(schedule.timezone)
            if (schedule.mode === "since-upload") setSinceSlots(schedule.slots as SinceUploadSlot[])
            if (schedule.mode === "time-of-day") setTodSlots(schedule.slots as TimeOfDaySlot[])
          }
          setFetching(false)
        })
        .catch(() => setFetching(false))
  }, [token])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  // Since-upload helpers
  function updateSinceSlot(i: number, patch: Partial<SinceUploadSlot>) {
    setSinceSlots((prev) => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }
  function addSinceSlot() {
    setSinceSlots((prev) => {
      const withoutLast = prev.slice(0, -1)
      const last = prev[prev.length - 1]
      return [
        ...withoutLast,
        { fileKey: last.fileKey, durationMinutes: 60 },
        { fileKey: "", durationMinutes: 0 },
      ]
    })
  }
  function removeSinceSlot(i: number) {
    setSinceSlots((prev) => {
      const next = prev.filter((_, idx) => idx !== i)
      if (next.length === 0) return [{ fileKey: originalKey, durationMinutes: 0 }]
      // ensure last slot has durationMinutes 0
      next[next.length - 1] = { ...next[next.length - 1], durationMinutes: 0 }
      return next
    })
  }

  // Time-of-day helpers
  function updateTodSlot(i: number, patch: Partial<TimeOfDaySlot>) {
    setTodSlots((prev) => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }
  function addTodSlot() {
    setTodSlots((prev) => [...prev, { fileKey: "", startTime: "00:00", endTime: "01:00" }])
  }
  function removeTodSlot(i: number) {
    setTodSlots((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setLoading(true)
    const schedule: Schedule = mode === "since-upload"
        ? { mode, uploadedAt: Date.now(), slots: sinceSlots }
        : { mode, timezone, slots: todSlots }

    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, schedule }),
    })
    setLoading(false)
    if (res.ok) { onSaved("Schedule saved"); onClose() }
    else onSaved("Could not save schedule")
  }

  async function handleClear() {
    setLoading(true)
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, schedule: null }),
    })
    setLoading(false)
    onSaved("Schedule cleared")
    onClose()
  }

  return (
      <div className="lightbox-backdrop" onClick={onClose}>
        <div className="sched-modal" onClick={(e) => e.stopPropagation()}>
          <button className="lightbox-close" onClick={onClose} aria-label="Close">✕</button>
          <p className="eyebrow">Schedule</p>
          <h2 className="temp-share-title">File schedule</h2>
          <p className="temp-share-file">{displayName(originalKey)}</p>

          {fetching ? (
              <p className="sched-hint">Loading...</p>
          ) : (
              <>
                {/* Mode tabs */}
                <div className="sched-tabs">
                  <button
                      className={`sched-tab${mode === "since-upload" ? " active" : ""}`}
                      onClick={() => setMode("since-upload")}
                  >
                    Time since upload
                  </button>
                  <button
                      className={`sched-tab${mode === "time-of-day" ? " active" : ""}`}
                      onClick={() => setMode("time-of-day")}
                  >
                    Time of day
                  </button>
                </div>

                {mode === "since-upload" && (
                    <div className="sched-section">
                      <p className="sched-hint">
                        Serve different files during sequential windows after the link is first visited. The last row serves forever.
                      </p>
                      <div className="sched-rows">
                        {sinceSlots.map((slot, i) => {
                          const isLast = i === sinceSlots.length - 1
                          return (
                              <div key={i} className="sched-row">
                                <span className="sched-row-index">{i + 1}</span>
                                <FileSelect value={slot.fileKey} files={files} onChange={(k) => updateSinceSlot(i, { fileKey: k })} />
                                {!isLast ? (
                                    <div className="sched-row-dur">
                                      <span className="sched-row-for">for</span>
                                      <DurationPicker
                                          value={slot.durationMinutes}
                                          onChange={(m) => updateSinceSlot(i, { durationMinutes: m })}
                                      />
                                    </div>
                                ) : (
                                    <span className="sched-row-forever">forever after</span>
                                )}
                                {sinceSlots.length > 1 && (
                                    <button className="sched-remove-btn" onClick={() => removeSinceSlot(i)} title="Remove">×</button>
                                )}
                              </div>
                          )
                        })}
                      </div>
                      <button className="sched-add-btn" onClick={addSinceSlot}>+ Add window</button>
                    </div>
                )}

                {mode === "time-of-day" && (
                    <div className="sched-section">
                      <p className="sched-hint">
                        Serve different files during recurring daily time windows. Gaps outside these windows serve the original file.
                      </p>
                      <div className="sched-tz-row">
                        <span className="sched-row-for">Timezone</span>
                        <select className="sched-select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                          {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                      </div>
                      <div className="sched-rows">
                        {todSlots.map((slot, i) => (
                            <div key={i} className="sched-row sched-row-tod">
                              <span className="sched-row-index">{i + 1}</span>
                              <FileSelect value={slot.fileKey} files={files} onChange={(k) => updateTodSlot(i, { fileKey: k })} />
                              <div className="sched-time-pair">
                                <TimePicker label="from" value={slot.startTime} onChange={(v) => updateTodSlot(i, { startTime: v })} />
                                <TimePicker label="to" value={slot.endTime} onChange={(v) => updateTodSlot(i, { endTime: v })} />
                              </div>
                              <button className="sched-remove-btn" onClick={() => removeTodSlot(i)} title="Remove">×</button>
                            </div>
                        ))}
                      </div>
                      <button className="sched-add-btn" onClick={addTodSlot}>+ Add window</button>
                    </div>
                )}

                <div className="sched-footer">
                  <button className="sched-clear-btn" onClick={handleClear} disabled={loading}>Clear schedule</button>
                  <button className="generate-btn sched-save-btn" onClick={handleSave} disabled={loading}>
                    {loading ? "Saving..." : "Save schedule"}
                  </button>
                </div>
              </>
          )}
        </div>
      </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const router = useRouter()
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [message, setMessage] = useState("")
  const [lightboxFile, setLightboxFile] = useState<FileItem | null>(null)
  const [tempShareFile, setTempShareFile] = useState<FileItem | null>(null)
  const [schedTarget, setSchedTarget] = useState<{ token: string; key: string } | null>(null)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    const response = await fetch("/api/files")
    if (response.ok) {
      const data = await response.json()
      setFiles(data.files)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadFiles() }, [loadFiles])

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setMessage("")
    setUploadProgress(0)
    const urlResponse = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    })
    if (!urlResponse.ok) { setMessage("Could not start upload"); setUploadProgress(null); return }
    const { url } = await urlResponse.json()
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("PUT", url)
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject())
      xhr.onerror = () => reject()
      xhr.send(file)
    }).then(
        () => setMessage(`Uploaded ${file.name}`),
        () => setMessage(`Upload failed for ${file.name}. Check the bucket CORS settings.`)
    )
    setUploadProgress(null)
    event.target.value = ""
    loadFiles()
  }

  async function handleShare(key: string) {
    const response = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    })
    if (!response.ok) { setMessage("Could not create link"); return }
    const { token } = await response.json()
    const shareUrl = `${window.location.origin}/s/${token}`
    await navigator.clipboard.writeText(shareUrl)
    setMessage("Link copied to clipboard")
  }

  async function handleSchedule(key: string) {
    // Get or create the permanent token for this file so we can attach a schedule
    const response = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    })
    if (!response.ok) { setMessage("Could not open schedule editor"); return }
    const { token } = await response.json()
    setSchedTarget({ token, key })
  }

  async function handleDelete(key: string) {
    const confirmed = window.confirm(`Delete ${displayName(key)}? This cannot be undone.`)
    if (!confirmed) return
    const response = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    })
    if (response.ok) { setMessage("File deleted"); loadFiles() }
    else setMessage("Could not delete file")
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" })
    router.push("/login")
  }

  return (
      <main className="admin-screen">
        <header className="admin-header">
          <div>
            <p className="eyebrow">Share Panel</p>
            <h1>Your files</h1>
          </div>
          <button className="ghost-button" onClick={handleLogout}>Log out</button>
        </header>

        <label className="upload-slot">
          <input type="file" onChange={handleUpload} hidden />
          <span>
          {uploadProgress !== null ? `Uploading... ${uploadProgress}%` : "Drop a file here or click to upload"}
        </span>
        </label>

        {message && <p className="status-line">{message}</p>}

        {loading ? (
            <p className="status-line">Loading files...</p>
        ) : files.length === 0 ? (
            <p className="status-line">No files yet. Upload your first one above.</p>
        ) : (
            <table className="ledger">
              <thead>
              <tr>
                <th className="col-preview"></th>
                <th>Name</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
              </thead>
              <tbody>
              {files.map((file) => (
                  <tr key={file.key}>
                    <td className="col-preview">
                      <MediaThumbnail file={file} onClick={() => setLightboxFile(file)} />
                    </td>
                    <td className="mono">{displayName(file.key)}</td>
                    <td className="mono">{formatSize(file.size)}</td>
                    <td className="mono">
                      {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : "-"}
                    </td>
                    <td className="actions">
                      <button onClick={() => handleShare(file.key)}>Share</button>
                      <button onClick={() => setTempShareFile(file)}>Temp</button>
                      <button onClick={() => handleSchedule(file.key)}>Schedule</button>
                      <button className="danger" onClick={() => handleDelete(file.key)}>Delete</button>
                    </td>
                  </tr>
              ))}
              </tbody>
            </table>
        )}

        {lightboxFile && (
            <LightboxModal file={lightboxFile} onClose={() => setLightboxFile(null)} />
        )}

        {tempShareFile && (
            <TempShareModal
                file={tempShareFile}
                onClose={() => setTempShareFile(null)}
                onCopied={(msg) => setMessage(msg)}
            />
        )}

        {schedTarget && (
            <ScheduleEditorModal
                token={schedTarget.token}
                originalKey={schedTarget.key}
                files={files}
                onClose={() => setSchedTarget(null)}
                onSaved={(msg) => setMessage(msg)}
            />
        )}
      </main>
  )
}

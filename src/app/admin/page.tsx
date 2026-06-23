"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"

interface FileItem {
  key: string
  size: number
  lastModified?: string
}

function displayName(key: string) {
  return key.replace(/^\d+-[a-zA-Z0-9_-]{6}-/, "")
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function AdminPage() {
  const router = useRouter()
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [message, setMessage] = useState("")

  const loadFiles = useCallback(async () => {
    setLoading(true)
    const response = await fetch("/api/files")
    if (response.ok) {
      const data = await response.json()
      setFiles(data.files)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

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

    if (!urlResponse.ok) {
      setMessage("Could not start upload")
      setUploadProgress(null)
      return
    }

    const { url } = await urlResponse.json()

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("PUT", url)
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
      xhr.upload.onprogress = (progressEvent) => {
        if (progressEvent.lengthComputable) {
          setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
        }
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

    if (!response.ok) {
      setMessage("Could not create link")
      return
    }

    const { token } = await response.json()
    const shareUrl = `${window.location.origin}/s/${token}`
    await navigator.clipboard.writeText(shareUrl)
    setMessage("Link copied to clipboard")
  }

  async function handleDelete(key: string) {
    const confirmed = window.confirm(`Delete ${displayName(key)}? This cannot be undone.`)
    if (!confirmed) return

    const response = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    })

    if (response.ok) {
      setMessage("File deleted")
      loadFiles()
    } else {
      setMessage("Could not delete file")
    }
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" })
    router.push("/login")
  }

  return (
    <main className="admin-screen">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Private vault</p>
          <h1>Your files</h1>
        </div>
        <button className="ghost-button" onClick={handleLogout}>
          Log out
        </button>
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
              <th>Name</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.key}>
                <td className="mono">{displayName(file.key)}</td>
                <td className="mono">{formatSize(file.size)}</td>
                <td className="mono">
                  {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : "-"}
                </td>
                <td className="actions">
                  <button onClick={() => handleShare(file.key)}>Share</button>
                  <button className="danger" onClick={() => handleDelete(file.key)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

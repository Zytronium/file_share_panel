"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")

    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })

    if (response.ok) {
      router.push("/admin")
      router.refresh()
    } else {
      setError("Incorrect password")
      setLoading(false)
    }
  }

  return (
    <main className="login-screen">
      <div className="dial" aria-hidden="true">
        <div className="dial-ring" />
        <div className="dial-ring dial-ring-inner" />
        <div className="dial-notch" />
      </div>

      <form className="login-card" onSubmit={handleSubmit}>
        <p className="eyebrow">Share Panel</p>
        <h1>Enter the password</h1>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          autoFocus
        />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Checking..." : "Unlock"}
        </button>
      </form>
    </main>
  )
}

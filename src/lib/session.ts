import { SignJWT, jwtVerify } from "jose"

export const SESSION_COOKIE = "vault_session"

const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "")

export async function createSessionToken() {
  return await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret)
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload.role === "admin"
  } catch {
    return false
  }
}

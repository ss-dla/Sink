const encoder = new TextEncoder()

export const SESSION_COOKIE = 'sink_session'
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[\w-]*$/.test(value))
    return null
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++)
      bytes[i] = binary.charCodeAt(i)
    return bytes
  }
  catch {
    return null
  }
}

function importKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
}

export interface SignedPayload {
  /** Purpose tag so a value signed for one use cannot be replayed as another. */
  t: string
  /** Expiry in epoch seconds. */
  exp: number
}

export async function signPayload<T extends SignedPayload>(payload: T, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', await importKey(secret, 'sign'), encoder.encode(body))
  return `${body}.${toBase64Url(new Uint8Array(signature))}`
}

export async function verifyPayload<T extends SignedPayload>(
  value: string | undefined,
  secret: string,
  type: T['t'],
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<T | null> {
  if (!value || !secret)
    return null

  const [body, signature, ...rest] = value.split('.')
  if (!body || !signature || rest.length > 0)
    return null

  const signatureBytes = fromBase64Url(signature)
  if (!signatureBytes)
    return null

  const valid = await crypto.subtle.verify('HMAC', await importKey(secret, 'verify'), signatureBytes, encoder.encode(body))
  if (!valid)
    return null

  const bodyBytes = fromBase64Url(body)
  if (!bodyBytes)
    return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(bodyBytes)) as T
    if (payload.t !== type || typeof payload.exp !== 'number' || payload.exp <= nowSeconds)
      return null
    return payload
  }
  catch {
    return null
  }
}

export interface SessionPayload extends SignedPayload {
  t: 'session'
  email: string
}

export function createSessionValue(email: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  return signPayload({ t: 'session', email, exp: nowSeconds + SESSION_TTL_SECONDS } satisfies SessionPayload, secret)
}

export function readSessionValue(value: string | undefined, secret: string, nowSeconds?: number): Promise<SessionPayload | null> {
  return verifyPayload<SessionPayload>(value, secret, 'session', nowSeconds)
}

/**
 * Cookie-authenticated mutations must come from our own origin. `SameSite=Lax`
 * already blocks cross-site POST cookies; this closes the same-site gap.
 */
export function isSameOriginMutationSafe(request: {
  method: string
  origin?: string
  requestOrigin: string
  secFetchSite?: string
}): boolean {
  if (request.secFetchSite === 'cross-site')
    return false

  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method))
    return true

  return request.origin === request.requestOrigin
}

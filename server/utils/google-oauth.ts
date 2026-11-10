import type { SignedPayload } from './session'

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const VALID_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

export const OAUTH_COOKIE = 'sink_oauth'
export const OAUTH_TTL_SECONDS = 10 * 60
export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback'

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface OAuthStatePayload extends SignedPayload {
  t: 'oauth'
  state: string
  verifier: string
  nonce: string
}

export function isGoogleLoginConfigured(config: { googleClientId: string, googleClientSecret: string, sessionSecret: string }): boolean {
  return !!config.googleClientId.trim() && !!config.googleClientSecret.trim() && !!config.sessionSecret.trim()
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomToken(byteLength = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return toBase64Url(new Uint8Array(digest))
}

export function buildAuthorizeUrl(config: GoogleOAuthConfig, params: { state: string, nonce: string, challenge: string }): string {
  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()
  return url.toString()
}

export async function exchangeCode(
  config: GoogleOAuthConfig,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })

  if (!response.ok)
    throw new Error(`Google token exchange failed with status ${response.status}`)

  const body = await response.json() as { id_token?: unknown }
  if (typeof body.id_token !== 'string' || !body.id_token)
    throw new Error('Google token response has no id_token')

  return body.id_token
}

export interface GoogleIdentity {
  email: string
  sub: string
}

/**
 * The id_token comes straight from Google's token endpoint over TLS, so the
 * signature check can be skipped (OpenID Connect Core 3.1.3.7); the claims are
 * still validated against this exact login attempt.
 */
export function readIdToken(
  idToken: string,
  expected: { clientId: string, nonce: string },
  nowSeconds = Math.floor(Date.now() / 1000),
): GoogleIdentity {
  const parts = idToken.split('.')
  if (parts.length !== 3 || !parts[1])
    throw new Error('Malformed id_token')

  let claims: Record<string, unknown>
  try {
    const binary = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    claims = JSON.parse(new TextDecoder().decode(bytes))
  }
  catch {
    throw new Error('Malformed id_token payload')
  }

  if (typeof claims.iss !== 'string' || !VALID_ISSUERS.includes(claims.iss))
    throw new Error('Unexpected id_token issuer')
  if (claims.aud !== expected.clientId)
    throw new Error('Unexpected id_token audience')
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds)
    throw new Error('Expired id_token')
  if (claims.nonce !== expected.nonce)
    throw new Error('Unexpected id_token nonce')
  if (claims.email_verified !== true && claims.email_verified !== 'true')
    throw new Error('Google email is not verified')
  if (typeof claims.email !== 'string' || !claims.email || typeof claims.sub !== 'string' || !claims.sub)
    throw new Error('id_token has no email')

  return { email: claims.email.trim().toLowerCase(), sub: claims.sub }
}

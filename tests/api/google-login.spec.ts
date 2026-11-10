import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { users } from '../../server/database/schema'
import { createSessionValue } from '../../server/utils/session'
import { clearLinkMigrationState, db, deleteStoredLinks, fetch, setLinkStoreD1Mode } from '../utils'

const sessionSecret = 'test-session-secret-for-vitest'

async function sessionHeaders(email: string, extra: Record<string, string> = {}) {
  return { Cookie: `sink_session=${await createSessionValue(email, sessionSecret)}`, ...extra }
}

async function addUser(email: string, role: 'admin' | 'editor', disabled = false) {
  await db.insert(users).values({ email, role, disabled, createdAt: 1, createdBy: 'test' })
}

beforeEach(async () => {
  await db.delete(users)
})

describe('/api/auth/providers', () => {
  it('reports Google login as enabled without requiring auth', async () => {
    const response = await fetch('/api/auth/providers')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ google: true })
  })
})

describe('/api/auth/google/login', () => {
  it('redirects to Google with state/PKCE and stores a signed HttpOnly cookie', async () => {
    const response = await fetch('/api/auth/google/login', { redirect: 'manual' })
    expect(response.status).toBe(302)

    const location = new URL(response.headers.get('Location')!)
    expect(location.origin).toBe('https://accounts.google.com')
    expect(location.searchParams.get('client_id')).toBe('test-client-id.apps.googleusercontent.com')
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost/api/auth/google/callback')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('state')).toBeTruthy()

    const cookie = response.headers.get('Set-Cookie')!
    expect(cookie).toContain('sink_oauth=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })
})

describe('/api/auth/google/callback', () => {
  it('rejects a callback without the login cookie', async () => {
    const response = await fetch('/api/auth/google/callback?code=abc&state=xyz', { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/dashboard/login?error=invalid_state')
  })

  it('rejects a callback whose state does not match the cookie', async () => {
    const login = await fetch('/api/auth/google/login', { redirect: 'manual' })
    const cookie = login.headers.get('Set-Cookie')!.split(';')[0]!
    const response = await fetch('/api/auth/google/callback?code=abc&state=forged', {
      redirect: 'manual',
      headers: { Cookie: cookie },
    })
    expect(response.headers.get('Location')).toBe('/dashboard/login?error=invalid_state')
    expect(response.headers.get('Set-Cookie') ?? '').not.toContain('sink_session=ey')
  })

  it('reports a Google-side error', async () => {
    const response = await fetch('/api/auth/google/callback?error=access_denied', { redirect: 'manual' })
    expect(response.headers.get('Location')).toBe('/dashboard/login?error=google_failed')
  })
})

describe('session cookie authentication', () => {
  it('authenticates a registered editor', async () => {
    await addUser('editor@datalabs.id', 'editor')
    const response = await fetch('/api/verify', { headers: await sessionHeaders('editor@datalabs.id') })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      authMethod: 'google-session',
      userID: 'editor@datalabs.id',
      userEmail: 'editor@datalabs.id',
    })
  })

  it('rejects an unregistered email even with a valid signature', async () => {
    const response = await fetch('/api/verify', { headers: await sessionHeaders('stranger@datalabs.id') })
    expect(response.status).toBe(401)
  })

  it('rejects a disabled user immediately', async () => {
    await addUser('gone@datalabs.id', 'editor', true)
    const response = await fetch('/api/verify', { headers: await sessionHeaders('gone@datalabs.id') })
    expect(response.status).toBe(401)
  })

  it('registers a bootstrap admin on first sight', async () => {
    const response = await fetch('/api/verify', { headers: await sessionHeaders('boot@datalabs.id') })
    expect(response.status).toBe(200)
    const [row] = await db.select().from(users).where(eq(users.email, 'boot@datalabs.id'))
    expect(row).toMatchObject({ role: 'admin', createdBy: 'bootstrap' })
  })

  it('rejects a forged cookie', async () => {
    await addUser('editor@datalabs.id', 'editor')
    const response = await fetch('/api/verify', { headers: { Cookie: 'sink_session=forged.value' } })
    expect(response.status).toBe(401)
  })

  it('blocks cookie-authenticated mutations without a same-origin Origin header', async () => {
    await addUser('editor@datalabs.id', 'editor')
    const headers = await sessionHeaders('editor@datalabs.id', { 'Content-Type': 'application/json' })
    const body = JSON.stringify({ url: 'https://example.com' })

    const noOrigin = await fetch('/api/link/create', { method: 'POST', headers, body })
    expect(noOrigin.status).toBe(403)

    const crossOrigin = await fetch('/api/link/create', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body })
    expect(crossOrigin.status).toBe(403)
  })

  it('allows same-origin cookie-authenticated mutations', async () => {
    await setLinkStoreD1Mode()
    await addUser('editor@datalabs.id', 'editor')
    const headers = await sessionHeaders('editor@datalabs.id', { 'Content-Type': 'application/json', 'Origin': 'http://localhost' })
    const response = await fetch('/api/link/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: 'https://example.com/google-login-test', slug: 'google-login-test' }),
    })
    expect(response.status).toBe(201)
    await deleteStoredLinks(['google-login-test'])
    await clearLinkMigrationState()
  })
})

describe('/api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' })
    expect(response.status).toBe(204)
    expect(response.headers.get('Set-Cookie')).toContain('sink_session=;')
  })
})

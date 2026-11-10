import { describe, expect, it } from 'vitest'
import { buildAuthorizeUrl, exchangeCode, isGoogleLoginConfigured, pkceChallenge, readIdToken } from '../../server/utils/google-oauth'
import { parseBootstrapAdmins } from '../../server/utils/users'

const clientId = 'client-123.apps.googleusercontent.com'
const nonce = 'nonce-abc'
const now = 1_700_000_000

function idToken(claims: Record<string, unknown>) {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'RS256' })}.${encode({
    iss: 'https://accounts.google.com',
    aud: clientId,
    exp: now + 600,
    nonce,
    sub: '1234',
    email: 'Alice@Datalabs.id',
    email_verified: true,
    ...claims,
  })}.sig`
}

describe('readIdToken', () => {
  const expected = { clientId, nonce }

  it('returns the lowercased verified email', () => {
    expect(readIdToken(idToken({}), expected, now)).toEqual({ email: 'alice@datalabs.id', sub: '1234' })
  })

  it.each([
    ['wrong audience', { aud: 'someone-else' }],
    ['wrong issuer', { iss: 'https://evil.example' }],
    ['expired', { exp: now - 1 }],
    ['wrong nonce', { nonce: 'replayed' }],
    ['unverified email', { email_verified: false }],
    ['missing email', { email: undefined }],
  ])('rejects %s', (_name, claims) => {
    expect(() => readIdToken(idToken(claims), expected, now)).toThrow()
  })

  it('rejects malformed tokens', () => {
    expect(() => readIdToken('not-a-jwt', expected, now)).toThrow()
    expect(() => readIdToken('a.%%%.c', expected, now)).toThrow()
  })
})

describe('buildAuthorizeUrl', () => {
  it('requests code flow with PKCE, nonce and state', async () => {
    const challenge = await pkceChallenge('verifier')
    const url = new URL(buildAuthorizeUrl(
      { clientId, clientSecret: 's', redirectUri: 'https://dla.ai.id/api/auth/google/callback' },
      { state: 'st', nonce, challenge },
    ))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: clientId,
      redirect_uri: 'https://dla.ai.id/api/auth/google/callback',
      response_type: 'code',
      scope: 'openid email',
      state: 'st',
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })
  })

  it('computes the RFC 7636 S256 challenge', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('exchangeCode', () => {
  const config = { clientId, clientSecret: 'secret', redirectUri: 'https://dla.ai.id/api/auth/google/callback' }

  it('posts the code and verifier and returns the id_token', async () => {
    let body: URLSearchParams | undefined
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = init.body as URLSearchParams
      return Response.json({ id_token: 'tok' })
    }) as unknown as typeof fetch
    expect(await exchangeCode(config, 'the-code', 'the-verifier', fetchImpl)).toBe('tok')
    expect(Object.fromEntries(body!)).toMatchObject({ code: 'the-code', code_verifier: 'the-verifier', grant_type: 'authorization_code' })
  })

  it('throws on a Google error and on a missing id_token', async () => {
    await expect(exchangeCode(config, 'c', 'v', (async () => new Response('no', { status: 400 })) as unknown as typeof fetch)).rejects.toThrow()
    await expect(exchangeCode(config, 'c', 'v', (async () => Response.json({})) as unknown as typeof fetch)).rejects.toThrow()
  })
})

describe('login configuration', () => {
  it('needs client id, secret and session secret', () => {
    expect(isGoogleLoginConfigured({ googleClientId: 'a', googleClientSecret: 'b', sessionSecret: 'c' })).toBe(true)
    expect(isGoogleLoginConfigured({ googleClientId: 'a', googleClientSecret: 'b', sessionSecret: ' ' })).toBe(false)
    expect(isGoogleLoginConfigured({ googleClientId: '', googleClientSecret: 'b', sessionSecret: 'c' })).toBe(false)
  })

  it('parses bootstrap admins', () => {
    expect(parseBootstrapAdmins(' A@datalabs.id, b@datalabs.id;\nc@datalabs.id ,, ')).toEqual(['a@datalabs.id', 'b@datalabs.id', 'c@datalabs.id'])
    expect(parseBootstrapAdmins('')).toEqual([])
  })
})

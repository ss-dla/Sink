import { describe, expect, it } from 'vitest'
import { createSessionValue, isSameOriginMutationSafe, readSessionValue, signPayload, verifyPayload } from '../../server/utils/session'

const secret = 'test-session-secret'
const now = 1_700_000_000

describe('session cookie', () => {
  it('round-trips a valid session', async () => {
    const value = await createSessionValue('a@datalabs.id', secret, now)
    expect(await readSessionValue(value, secret, now + 10)).toMatchObject({ t: 'session', email: 'a@datalabs.id' })
  })

  it('rejects an expired session', async () => {
    const value = await createSessionValue('a@datalabs.id', secret, now)
    expect(await readSessionValue(value, secret, now + 8 * 24 * 3600)).toBeNull()
  })

  it('rejects a tampered payload or signature', async () => {
    const value = await createSessionValue('a@datalabs.id', secret, now)
    const [body, signature] = value.split('.')
    const forgedBody = btoa(JSON.stringify({ t: 'session', email: 'root@datalabs.id', exp: now + 1000 })).replace(/=+$/, '')
    expect(await readSessionValue(`${forgedBody}.${signature}`, secret, now)).toBeNull()
    expect(await readSessionValue(`${body}.${signature!.slice(0, -2)}AA`, secret, now)).toBeNull()
  })

  it('rejects a session signed with another secret', async () => {
    const value = await createSessionValue('a@datalabs.id', 'other-secret', now)
    expect(await readSessionValue(value, secret, now)).toBeNull()
  })

  it('does not accept a value signed for another purpose', async () => {
    const value = await signPayload({ t: 'oauth', exp: now + 100 }, secret)
    expect(await readSessionValue(value, secret, now)).toBeNull()
    expect(await verifyPayload(value, secret, 'oauth', now)).not.toBeNull()
  })

  it('rejects garbage and empty values', async () => {
    for (const value of [undefined, '', 'abc', 'a.b.c', '!!.!!'])
      expect(await readSessionValue(value, secret, now)).toBeNull()
    expect(await readSessionValue(await createSessionValue('a@datalabs.id', secret, now), '', now)).toBeNull()
  })
})

describe('isSameOriginMutationSafe', () => {
  const base = { requestOrigin: 'https://dla.ai.id' }

  it('allows reads without an Origin', () => {
    expect(isSameOriginMutationSafe({ ...base, method: 'GET' })).toBe(true)
  })

  it('allows same-origin mutations', () => {
    expect(isSameOriginMutationSafe({ ...base, method: 'POST', origin: 'https://dla.ai.id' })).toBe(true)
  })

  it('rejects mutations from another origin or without Origin', () => {
    expect(isSameOriginMutationSafe({ ...base, method: 'POST', origin: 'https://evil.example' })).toBe(false)
    expect(isSameOriginMutationSafe({ ...base, method: 'DELETE' })).toBe(false)
  })

  it('rejects cross-site requests even for reads', () => {
    expect(isSameOriginMutationSafe({ ...base, method: 'GET', secFetchSite: 'cross-site' })).toBe(false)
  })
})

import type { ImportResult } from '../../shared/schemas/import'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { linkAudit, linkOwners, users } from '../../server/database/schema'
import { createSessionValue } from '../../server/utils/session'
import { clearLinkMigrationState, db, deleteStoredLinks, fetch, setLinkStoreD1Mode } from '../utils'

const sessionSecret = 'test-session-secret-for-vitest'
const slugs = ['audit-one', 'audit-two']

async function as(email: string, path: string, init: { method?: string, body?: unknown } = {}) {
  return fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      'Cookie': `sink_session=${await createSessionValue(email, sessionSecret)}`,
      'Content-Type': 'application/json',
      'Origin': 'http://localhost',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

interface AuditItem { id: number, actorEmail: string, actorRole: string, action: string, slug: string | null, detail: Record<string, any> | null }
async function auditItems(query = ''): Promise<{ items: AuditItem[], nextBefore: number | null }> {
  const response = await as('admin@datalabs.id', `/api/audit${query}`)
  expect(response.status).toBe(200)
  return response.json()
}

beforeEach(async () => {
  await setLinkStoreD1Mode()
  await db.delete(users)
  await db.delete(linkOwners)
  await db.delete(linkAudit)
  await db.insert(users).values([
    { email: 'admin@datalabs.id', role: 'admin', createdAt: 1, createdBy: 'test' },
    { email: 'alice@datalabs.id', role: 'editor', createdAt: 2, createdBy: 'test' },
  ])
  await deleteStoredLinks(slugs)
})

describe('user management', () => {
  it('registers a user who can then log in, and records it', async () => {
    const created = await as('admin@datalabs.id', '/api/users', { method: 'POST', body: { email: ' Carol@Datalabs.id ', role: 'editor' } })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ user: { email: 'carol@datalabs.id', role: 'editor', disabled: false, createdBy: 'admin@datalabs.id' } })

    expect((await as('carol@datalabs.id', '/api/verify')).status).toBe(200)
    const { items } = await auditItems()
    expect(items[0]).toMatchObject({ action: 'user.add', actorEmail: 'admin@datalabs.id', actorRole: 'admin', detail: { email: 'carol@datalabs.id', role: 'editor' } })
  })

  it('rejects duplicates and invalid emails', async () => {
    expect((await as('admin@datalabs.id', '/api/users', { method: 'POST', body: { email: 'alice@datalabs.id' } })).status).toBe(409)
    expect((await as('admin@datalabs.id', '/api/users', { method: 'POST', body: { email: 'not-an-email' } })).status).toBe(400)
  })

  it('lists users', async () => {
    const response = await as('admin@datalabs.id', '/api/users')
    const { users: rows } = await response.json() as { users: { email: string }[] }
    expect(rows.map(row => row.email)).toEqual(['admin@datalabs.id', 'alice@datalabs.id'])
  })

  it('changes a role and locks out a disabled user on the next request', async () => {
    const promote = await as('admin@datalabs.id', '/api/users', { method: 'PATCH', body: { email: 'alice@datalabs.id', role: 'admin' } })
    expect(promote.status).toBe(200)
    expect(await (await as('alice@datalabs.id', '/api/verify')).json()).toMatchObject({ userRole: 'admin' })

    const disable = await as('admin@datalabs.id', '/api/users', { method: 'PATCH', body: { email: 'alice@datalabs.id', disabled: true } })
    expect(disable.status).toBe(200)
    expect((await as('alice@datalabs.id', '/api/verify')).status).toBe(401)

    const { items } = await auditItems()
    expect(items.map(item => item.action)).toEqual(['user.update', 'user.update'])
    expect(items[0]!.detail).toMatchObject({ email: 'alice@datalabs.id', before: { disabled: false }, after: { disabled: true } })
  })

  it('stops an admin from demoting or disabling themselves', async () => {
    const demote = await as('admin@datalabs.id', '/api/users', { method: 'PATCH', body: { email: 'admin@datalabs.id', role: 'editor' } })
    expect(demote.status).toBe(409)
    const disable = await as('admin@datalabs.id', '/api/users', { method: 'PATCH', body: { email: 'admin@datalabs.id', disabled: true } })
    expect(disable.status).toBe(409)
    const [row] = await db.select().from(users).where(eq(users.email, 'admin@datalabs.id'))
    expect(row).toMatchObject({ role: 'admin', disabled: false })
  })

  it('returns 404 for an unknown user and 400 for an empty change', async () => {
    expect((await as('admin@datalabs.id', '/api/users', { method: 'PATCH', body: { email: 'ghost@datalabs.id', role: 'admin' } })).status).toBe(404)
    expect((await as('admin@datalabs.id', '/api/users', { method: 'PATCH', body: { email: 'alice@datalabs.id' } })).status).toBe(400)
  })
})

describe('audit log', () => {
  it('records create, edit and delete with the actor and without passwords', async () => {
    await as('alice@datalabs.id', '/api/link/create', {
      method: 'POST',
      body: { url: 'https://example.com/one', slug: 'audit-one', password: 'hunter2hunter2' },
    })
    await as('admin@datalabs.id', '/api/link/edit', { method: 'PUT', body: { slug: 'audit-one', url: 'https://example.com/changed' } })
    await as('alice@datalabs.id', '/api/link/delete', { method: 'POST', body: { slug: 'audit-one' } })

    const { items } = await auditItems('?slug=audit-one')
    expect(items.map(item => [item.action, item.actorEmail, item.actorRole])).toEqual([
      ['link.delete', 'alice@datalabs.id', 'editor'],
      ['link.edit', 'admin@datalabs.id', 'admin'],
      ['link.create', 'alice@datalabs.id', 'editor'],
    ])
    expect(items[2]!.detail!.after).toMatchObject({ url: 'https://example.com/one', slug: 'audit-one' })
    expect(items[1]!.detail).toMatchObject({ before: { url: 'https://example.com/one' }, after: { url: 'https://example.com/changed' } })
    expect(items[0]!.detail!.before).toMatchObject({ url: 'https://example.com/changed' })
    for (const item of items) {
      expect(JSON.stringify(item.detail)).not.toContain('password')
      expect(JSON.stringify(item.detail)).not.toContain('hunter2')
    }
  })

  it('does not log a refused delete', async () => {
    await as('admin@datalabs.id', '/api/link/create', { method: 'POST', body: { url: 'https://example.com/one', slug: 'audit-one' } })
    expect((await as('alice@datalabs.id', '/api/link/delete', { method: 'POST', body: { slug: 'audit-one' } })).status).toBe(403)
    expect((await auditItems('?slug=audit-one')).items.map(item => item.action)).toEqual(['link.create'])
  })

  it('records an import summary', async () => {
    const response = await as('admin@datalabs.id', '/api/link/import', {
      method: 'POST',
      body: { version: '1.0', links: [{ url: 'https://example.com/two', slug: 'audit-two' }] },
    })
    expect(response.status).toBe(200)
    expect(await response.json() as ImportResult).toMatchObject({ success: 1 })
    expect((await auditItems()).items[0]).toMatchObject({ action: 'link.import', slug: null, detail: { success: 1, skipped: 0, failed: 0 } })
  })

  it('filters by actor and paginates newest first', async () => {
    for (const slug of slugs)
      await as('alice@datalabs.id', '/api/link/create', { method: 'POST', body: { url: `https://example.com/${slug}`, slug } })
    await as('admin@datalabs.id', '/api/users', { method: 'POST', body: { email: 'dave@datalabs.id' } })

    const alice = await auditItems('?actor=Alice@datalabs.id')
    expect(alice.items.map(item => item.slug)).toEqual(['audit-two', 'audit-one'])

    const first = await auditItems('?limit=2')
    expect(first.items).toHaveLength(2)
    expect(first.nextBefore).toBe(first.items[1]!.id)
    const second = await auditItems(`?limit=2&before=${first.nextBefore}`)
    expect(second.items).toHaveLength(1)
    expect(second.nextBefore).toBeNull()
    expect(second.items[0]!.id).toBeLessThan(first.items[1]!.id)
  })
})

describe.sequential('cleanup', () => {
  it('restores migration state', async () => {
    await deleteStoredLinks(slugs)
    await clearLinkMigrationState()
  })
})

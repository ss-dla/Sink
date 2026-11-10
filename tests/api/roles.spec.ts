import { beforeEach, describe, expect, it } from 'vitest'
import { linkOwners, users } from '../../server/database/schema'
import { createSessionValue } from '../../server/utils/session'
import { clearLinkMigrationState, db, deleteStoredLinks, fetch, fetchWithAuth, setLinkStoreD1Mode } from '../utils'

const sessionSecret = 'test-session-secret-for-vitest'
const slugs = ['roles-alice', 'roles-bob', 'roles-legacy']

async function as(email: string, path: string, init: { method?: string, body?: unknown } = {}) {
  const method = init.method ?? 'GET'
  return fetch(path, {
    method,
    headers: {
      'Cookie': `sink_session=${await createSessionValue(email, sessionSecret)}`,
      'Content-Type': 'application/json',
      'Origin': 'http://localhost',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

function createAs(email: string, slug: string) {
  return as(email, '/api/link/create', { method: 'POST', body: { url: `https://example.com/${slug}`, slug } })
}
function deleteAs(email: string, slug: string) {
  return as(email, '/api/link/delete', { method: 'POST', body: { slug } })
}

beforeEach(async () => {
  await setLinkStoreD1Mode()
  await db.delete(users)
  await db.delete(linkOwners)
  await db.insert(users).values([
    { email: 'admin@datalabs.id', role: 'admin', createdAt: 1, createdBy: 'test' },
    { email: 'alice@datalabs.id', role: 'editor', createdAt: 1, createdBy: 'test' },
    { email: 'bob@datalabs.id', role: 'editor', createdAt: 1, createdBy: 'test' },
  ])
  await deleteStoredLinks(slugs)
})

describe('role reporting', () => {
  it('reports the role from the users table', async () => {
    expect(await (await as('admin@datalabs.id', '/api/verify')).json()).toMatchObject({ userRole: 'admin' })
    expect(await (await as('alice@datalabs.id', '/api/verify')).json()).toMatchObject({ userRole: 'editor' })
  })

  it('treats the site token as admin', async () => {
    expect(await (await fetchWithAuth('/api/verify')).json()).toMatchObject({ userRole: 'admin' })
  })

  it('applies a role change on the very next request', async () => {
    expect((await as('alice@datalabs.id', '/api/link/export')).status).toBe(403)
    await db.insert(users).values({ email: 'alice@datalabs.id', role: 'admin', createdAt: 1, createdBy: 'test' }).onConflictDoUpdate({ target: users.email, set: { role: 'admin' } })
    expect((await as('alice@datalabs.id', '/api/link/export')).status).toBe(200)
  })
})

describe('admin-only endpoints', () => {
  const endpoints: [string, string, unknown?][] = [
    ['GET', '/api/link/export'],
    ['POST', '/api/link/import', { links: [] }],
    ['POST', '/api/backup'],
    ['POST', '/api/link/migration/run', {}],
    ['POST', '/api/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }],
    ['GET', '/api/users'],
    ['POST', '/api/users', { email: 'x@datalabs.id' }],
    ['PATCH', '/api/users', { email: 'bob@datalabs.id', role: 'admin' }],
    ['GET', '/api/audit'],
  ]

  it.each(endpoints)('rejects an editor on %s %s', async (method, path, body) => {
    const response = await as('alice@datalabs.id', path, { method, body })
    expect(response.status).toBe(403)
  })

  it.each(endpoints.slice(0, 2))('lets an admin through on %s %s', async (method, path, body) => {
    const response = await as('admin@datalabs.id', path, { method, body })
    expect(response.status).not.toBe(403)
  })
})

describe('link ownership', () => {
  it('lets editors create and edit each other\'s links', async () => {
    expect((await createAs('alice@datalabs.id', 'roles-alice')).status).toBe(201)
    const edit = await as('bob@datalabs.id', '/api/link/edit', {
      method: 'PUT',
      body: { slug: 'roles-alice', url: 'https://example.com/changed' },
    })
    expect(edit.status).toBe(201)
  })

  it('lets an editor delete their own link only', async () => {
    await createAs('alice@datalabs.id', 'roles-alice')
    await createAs('bob@datalabs.id', 'roles-bob')

    expect((await deleteAs('alice@datalabs.id', 'roles-bob')).status).toBe(403)
    expect((await deleteAs('alice@datalabs.id', 'roles-alice')).status).toBe(204)
    expect((await as('alice@datalabs.id', '/api/link/query?slug=roles-alice')).status).toBe(404)
    expect((await as('alice@datalabs.id', '/api/link/query?slug=roles-bob')).status).toBe(200)
  })

  it('lets an admin delete any link', async () => {
    await createAs('alice@datalabs.id', 'roles-alice')
    expect((await deleteAs('admin@datalabs.id', 'roles-alice')).status).toBe(204)
  })

  it('keeps links without an owner record admin-only', async () => {
    await createAs('alice@datalabs.id', 'roles-legacy')
    await db.delete(linkOwners)
    expect((await deleteAs('alice@datalabs.id', 'roles-legacy')).status).toBe(403)
    expect((await deleteAs('admin@datalabs.id', 'roles-legacy')).status).toBe(204)
  })

  it('does not hand ownership to the previous owner after delete and re-create', async () => {
    await createAs('alice@datalabs.id', 'roles-alice')
    await deleteAs('admin@datalabs.id', 'roles-alice')
    await createAs('bob@datalabs.id', 'roles-alice')
    expect((await deleteAs('alice@datalabs.id', 'roles-alice')).status).toBe(403)
    expect((await deleteAs('bob@datalabs.id', 'roles-alice')).status).toBe(204)
  })

  it('records the owner on upsert-created links', async () => {
    const created = await as('alice@datalabs.id', '/api/link/upsert', {
      method: 'POST',
      body: { url: 'https://example.com/roles-alice', slug: 'roles-alice' },
    })
    expect(created.status).toBe(201)
    expect((await deleteAs('bob@datalabs.id', 'roles-alice')).status).toBe(403)
    expect((await deleteAs('alice@datalabs.id', 'roles-alice')).status).toBe(204)
  })
})

describe.sequential('cleanup', () => {
  it('restores migration state', async () => {
    await deleteStoredLinks(slugs)
    await clearLinkMigrationState()
  })
})

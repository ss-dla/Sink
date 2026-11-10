import type { H3Event } from 'h3'
import type { UserRole } from '../../shared/types/auth'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { linkOwners } from '../database/schema'

export function getUserRole(event: H3Event): UserRole | null {
  const role: unknown = event.context.userRole
  return role === 'admin' || role === 'editor' ? role : null
}

export function requireAdmin(event: H3Event): void {
  if (getUserRole(event) !== 'admin') {
    throw createError({
      status: 403,
      statusText: 'Admin role required',
    })
  }
}

function getActorEmail(event: H3Event): string {
  return typeof event.context.userEmail === 'string' ? event.context.userEmail : 'unknown'
}

/** Remembers who created a link; deliberately independent of the KV/D1 link store. */
export async function recordLinkOwner(event: H3Event, slug: string): Promise<void> {
  const owner = getActorEmail(event)
  const createdAt = Math.floor(Date.now() / 1000)
  await drizzle(event.context.cloudflare.env.DB)
    .insert(linkOwners)
    .values({ slug, owner, createdAt })
    .onConflictDoUpdate({ target: linkOwners.slug, set: { owner, createdAt } })
}

export async function forgetLinkOwner(event: H3Event, slug: string): Promise<void> {
  await drizzle(event.context.cloudflare.env.DB).delete(linkOwners).where(eq(linkOwners.slug, slug))
}

/** Admins delete anything; editors only links they created. Links without an owner record are admin-only. */
export async function assertCanDeleteLink(event: H3Event, slug: string): Promise<void> {
  const role = getUserRole(event)
  if (role === 'admin')
    return

  if (role === 'editor') {
    const [row] = await drizzle(event.context.cloudflare.env.DB)
      .select({ owner: linkOwners.owner })
      .from(linkOwners)
      .where(eq(linkOwners.slug, slug))
      .limit(1)
    if (row && row.owner === getActorEmail(event))
      return
  }

  throw createError({
    status: 403,
    statusText: 'Only the link creator or an admin can delete this link',
  })
}

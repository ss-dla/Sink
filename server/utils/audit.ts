import type { H3Event } from 'h3'
import { drizzle } from 'drizzle-orm/d1'
import { linkAudit } from '../database/schema'

export type AuditAction
  = | 'link.create'
    | 'link.edit'
    | 'link.delete'
    | 'link.import'
    | 'user.add'
    | 'user.update'
    | 'auth.login'

/** Drops secrets before a link is written into the audit trail. */
export function auditLink<T extends { password?: unknown }>(link: T | null | undefined): Omit<T, 'password'> | null {
  if (!link)
    return null
  const { password: _password, ...rest } = link
  return rest
}

/**
 * Records who did what. Audit failures are logged but never fail the request,
 * because the mutation has already been applied by the time we get here.
 */
export async function recordAudit(
  event: H3Event,
  action: AuditAction,
  slug: string | null,
  detail?: unknown,
  actor?: { email: string, role: string },
): Promise<void> {
  const actorEmail = actor?.email ?? (typeof event.context.userEmail === 'string' ? event.context.userEmail : 'unknown')
  const actorRole = actor?.role ?? (typeof event.context.userRole === 'string' ? event.context.userRole : 'unknown')

  try {
    await drizzle(event.context.cloudflare.env.DB).insert(linkAudit).values({
      at: Math.floor(Date.now() / 1000),
      actorEmail,
      actorRole,
      action,
      slug,
      detail: detail === undefined ? null : JSON.stringify(detail),
    })
  }
  catch (error) {
    console.error('Failed to write audit log', error)
  }
}

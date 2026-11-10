import { and, desc, eq, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { z } from 'zod'
import { linkAudit } from '../database/schema'

defineRouteMeta({
  openAPI: {
    description: 'List audit log entries, newest first (admin only)',
    security: [{ bearerAuth: [] }],
  },
})

const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.number().int().positive().optional(),
  slug: z.string().trim().min(1).optional(),
  actor: z.string().trim().toLowerCase().min(1).optional(),
})

export default eventHandler(async (event) => {
  const { limit, before, slug, actor } = await getValidatedQuery(event, AuditQuerySchema.parse)

  const conditions = [
    before ? lt(linkAudit.id, before) : undefined,
    slug ? eq(linkAudit.slug, slug) : undefined,
    actor ? eq(linkAudit.actorEmail, actor) : undefined,
  ].filter(condition => condition !== undefined)

  const rows = await drizzle(event.context.cloudflare.env.DB)
    .select()
    .from(linkAudit)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(linkAudit.id))
    .limit(limit + 1)

  const items = rows.slice(0, limit).map(row => ({
    ...row,
    detail: row.detail ? JSON.parse(row.detail) as unknown : null,
  }))
  return { items, nextBefore: rows.length > limit ? items.at(-1)!.id : null }
})

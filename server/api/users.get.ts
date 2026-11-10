import { asc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { users } from '../database/schema'

defineRouteMeta({
  openAPI: {
    description: 'List registered users (admin only)',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  const rows = await drizzle(event.context.cloudflare.env.DB).select().from(users).orderBy(asc(users.createdAt), asc(users.email))
  return { users: rows }
})

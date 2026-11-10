import { drizzle } from 'drizzle-orm/d1'
import { z } from 'zod'
import { users } from '../database/schema'

defineRouteMeta({
  openAPI: {
    description: 'Register a user who may log in with Google (admin only)',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: { 'application/json': {} },
    },
  },
})

const AddUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(['admin', 'editor']).default('editor'),
})

export default eventHandler(async (event) => {
  const { email, role } = await readValidatedBody(event, AddUserSchema.parse)
  const createdBy = typeof event.context.userEmail === 'string' ? event.context.userEmail : 'unknown'

  const inserted = await drizzle(event.context.cloudflare.env.DB)
    .insert(users)
    .values({ email, role, createdAt: Math.floor(Date.now() / 1000), createdBy })
    .onConflictDoNothing()
    .returning()
  if (inserted.length === 0)
    throw createError({ status: 409, statusText: 'User already exists' })

  await recordAudit(event, 'user.add', null, { email, role })
  setResponseStatus(event, 201)
  return { user: inserted[0] }
})

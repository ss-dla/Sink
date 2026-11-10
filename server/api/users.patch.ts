import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { z } from 'zod'
import { users } from '../database/schema'

defineRouteMeta({
  openAPI: {
    description: 'Change a user\'s role or enable/disable the user (admin only)',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: { 'application/json': {} },
    },
  },
})

const UpdateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(['admin', 'editor']).optional(),
  disabled: z.boolean().optional(),
}).refine(value => value.role !== undefined || value.disabled !== undefined, 'role or disabled is required')

export default eventHandler(async (event) => {
  const { email, role, disabled } = await readValidatedBody(event, UpdateUserSchema.parse)
  const actor = typeof event.context.userEmail === 'string' ? event.context.userEmail.toLowerCase() : ''

  // An admin cannot lock themselves out; another admin (or the site token) has to do it.
  if (email === actor && (role === 'editor' || disabled === true)) {
    throw createError({ status: 409, statusText: 'You cannot demote or disable yourself' })
  }

  const db = drizzle(event.context.cloudflare.env.DB)
  const [before] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!before)
    throw createError({ status: 404, statusText: 'User not found' })

  const [after] = await db
    .update(users)
    .set({
      ...(role === undefined ? {} : { role }),
      ...(disabled === undefined ? {} : { disabled }),
    })
    .where(eq(users.email, email))
    .returning()

  await recordAudit(event, 'user.update', null, {
    email,
    before: { role: before.role, disabled: before.disabled },
    after: { role: after!.role, disabled: after!.disabled },
  })
  return { user: after }
})

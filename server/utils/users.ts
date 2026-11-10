import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { users } from '../database/schema'

export type UserRole = 'admin' | 'editor'

export interface SinkUser {
  email: string
  role: UserRole
}

export function parseBootstrapAdmins(raw: string): string[] {
  return raw.split(/[\s,;]+/).map(email => email.trim().toLowerCase()).filter(Boolean)
}

/**
 * Returns the active user for an email, or null when the email is unregistered
 * or disabled. Emails listed in `bootstrapAdmins` are registered as admins on
 * first sight, so the first admin never has to be created by hand.
 */
export async function findActiveUser(
  env: Cloudflare.Env,
  rawEmail: string,
  bootstrapAdmins: string[],
): Promise<SinkUser | null> {
  const email = rawEmail.trim().toLowerCase()
  if (!email)
    return null

  const db = drizzle(env.DB)
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1)

  if (row)
    return row.disabled ? null : { email: row.email, role: row.role }

  if (!bootstrapAdmins.includes(email))
    return null

  await db.insert(users).values({
    email,
    role: 'admin',
    createdAt: Math.floor(Date.now() / 1000),
    createdBy: 'bootstrap',
  }).onConflictDoNothing()

  const [created] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  return created && !created.disabled ? { email: created.email, role: created.role } : null
}

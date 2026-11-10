import type { H3Event } from 'h3'
import type { SinkUser } from './users'
import { isGoogleLoginConfigured } from './google-oauth'
import { readSessionValue, SESSION_COOKIE } from './session'
import { findActiveUser, parseBootstrapAdmins } from './users'

/** Resolves the signed-in Google user from the session cookie, re-reading the role from D1 on every request. */
export async function getSessionUser(event: H3Event): Promise<SinkUser | null> {
  const config = useRuntimeConfig(event)
  if (!isGoogleLoginConfigured(config))
    return null

  const session = await readSessionValue(getCookie(event, SESSION_COOKIE), config.sessionSecret)
  if (!session)
    return null

  return findActiveUser(event.context.cloudflare.env, session.email, parseBootstrapAdmins(config.bootstrapAdmins))
}

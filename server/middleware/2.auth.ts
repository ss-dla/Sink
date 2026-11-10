import { timingSafeEqual } from 'node:crypto'

export default eventHandler(async (event) => {
  if (!event.path.startsWith('/api/') || event.path.startsWith('/api/auth/'))
    return

  const token = getHeader(event, 'Authorization')?.replace(/^Bearer\s+/, '')
  if (await verifySiteToken(token, useRuntimeConfig(event).siteToken)) {
    event.context.authMethod = 'site-token'
    event.context.userID = 'root'
    event.context.userEmail = `root@${getRequestURL(event).hostname}`
    event.context.userRole = 'admin'
    return
  }

  const sessionUser = await getSessionUser(event)
  if (sessionUser) {
    const requestURL = getRequestURL(event)
    if (!isSameOriginMutationSafe({
      method: event.method,
      origin: getHeader(event, 'Origin'),
      requestOrigin: requestURL.origin,
      secFetchSite: getHeader(event, 'Sec-Fetch-Site'),
    })) {
      throw createError({
        status: 403,
        statusText: 'Forbidden',
      })
    }

    event.context.authMethod = 'google-session'
    event.context.userID = sessionUser.email
    event.context.userEmail = sessionUser.email
    event.context.userRole = sessionUser.role
    return
  }

  const accessIdentity = await verifyCloudflareAccess(event)
  if (accessIdentity) {
    if (isCloudflareAccessRequestAllowed(event)) {
      Object.assign(
        event.context,
        mapCloudflareAccessIdentity(accessIdentity, getRequestURL(event).hostname),
        // The Access policy is the gate for these users, so they keep full access.
        { userRole: 'admin' },
      )
      return
    }

    throw createError({
      status: 403,
      statusText: 'Forbidden',
    })
  }

  setResponseHeader(event, 'WWW-Authenticate', 'Bearer')

  if (token && token.length < 8) {
    throw createError({
      status: 401,
      statusText: 'Token is too short',
    })
  }

  throw createError({
    status: 401,
    statusText: 'Unauthorized',
  })
})

async function verifySiteToken(provided: string | undefined, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided || '')),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash))
}

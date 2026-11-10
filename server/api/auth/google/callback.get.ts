defineRouteMeta({
  openAPI: {
    description: 'Finish the Google login flow',
    responses: {
      302: {
        description: 'Redirect to the dashboard or back to the login page with an error',
      },
    },
  },
})

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!isGoogleLoginConfigured(config))
    return sendRedirect(event, '/dashboard/login?error=google_disabled')

  const url = getRequestURL(event)
  const fail = (error: string) => sendRedirect(event, `/dashboard/login?error=${error}`)

  const saved = await verifyPayload<OAuthStatePayload>(getCookie(event, OAUTH_COOKIE), config.sessionSecret, 'oauth')
  deleteCookie(event, OAUTH_COOKIE, { path: GOOGLE_CALLBACK_PATH })

  const { code, state, error } = getQuery(event)
  if (error)
    return fail('google_failed')
  if (!saved || typeof state !== 'string' || state !== saved.state || typeof code !== 'string' || !code)
    return fail('invalid_state')

  let email: string
  try {
    const idToken = await exchangeCode(
      {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        redirectUri: `${url.origin}${GOOGLE_CALLBACK_PATH}`,
      },
      code,
      saved.verifier,
    )
    email = readIdToken(idToken, { clientId: config.googleClientId, nonce: saved.nonce }).email
  }
  catch (e) {
    console.error('Google login failed', e)
    return fail('google_failed')
  }

  const user = await findActiveUser(event.context.cloudflare.env, email, parseBootstrapAdmins(config.bootstrapAdmins))
  if (!user)
    return fail('not_registered')

  setCookie(event, SESSION_COOKIE, await createSessionValue(user.email, config.sessionSecret), {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
  return sendRedirect(event, '/dashboard')
})

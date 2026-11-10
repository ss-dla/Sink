defineRouteMeta({
  openAPI: {
    description: 'Start the Google login flow',
    responses: {
      302: {
        description: 'Redirect to Google',
      },
    },
  },
})

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!isGoogleLoginConfigured(config))
    return sendRedirect(event, '/dashboard/login?error=google_disabled')

  const url = getRequestURL(event)
  const state = randomToken()
  const nonce = randomToken()
  const verifier = randomToken(48)

  const payload: OAuthStatePayload = {
    t: 'oauth',
    state,
    nonce,
    verifier,
    exp: Math.floor(Date.now() / 1000) + OAUTH_TTL_SECONDS,
  }
  setCookie(event, OAUTH_COOKIE, await signPayload(payload, config.sessionSecret), {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: GOOGLE_CALLBACK_PATH,
    maxAge: OAUTH_TTL_SECONDS,
  })

  return sendRedirect(event, buildAuthorizeUrl(
    {
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: `${url.origin}${GOOGLE_CALLBACK_PATH}`,
    },
    { state, nonce, challenge: await pkceChallenge(verifier) },
  ))
})

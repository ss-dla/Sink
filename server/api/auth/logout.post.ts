defineRouteMeta({
  openAPI: {
    description: 'Clear the Google login session cookie',
    responses: {
      204: {
        description: 'Session cleared',
      },
    },
  },
})

export default eventHandler((event) => {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
  setResponseStatus(event, 204)
  return null
})

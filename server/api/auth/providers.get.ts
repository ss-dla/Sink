defineRouteMeta({
  openAPI: {
    description: 'List the interactive login providers enabled on this deployment',
    responses: {
      200: {
        description: 'Enabled providers',
      },
    },
  },
})

export default eventHandler((event) => {
  return { google: isGoogleLoginConfigured(useRuntimeConfig(event)) }
})

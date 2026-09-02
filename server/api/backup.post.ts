defineRouteMeta({
  openAPI: {
    description: 'Manually trigger a backup (saved to R2 or KV)',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  const env = event.context.cloudflare.env
  const result = await backupLinksToR2(env, true)
  if (!result.completed && result.reason === 'migration-incomplete')
    throw createError({ status: 423, statusText: 'Link migration is required' })
  if (!result.completed)
    throw createError({ status: 503, statusText: 'Storage not configured for backup' })

  return {
    success: true,
    message: 'Backup completed successfully',
  }
})

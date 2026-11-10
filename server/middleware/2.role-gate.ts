// Endpoints only admins may call. Runs after `2.auth.ts`, which sets `event.context.userRole`.
const ADMIN_ONLY_PATHS = new Set([
  '/api/audit',
  '/api/backup',
  '/api/mcp',
  '/api/users',
  '/api/link/export',
  '/api/link/import',
  '/api/link/migration/run',
])

export default eventHandler((event) => {
  if (ADMIN_ONLY_PATHS.has(getRequestURL(event).pathname.replace(/\/+$/, '')))
    requireAdmin(event)
})

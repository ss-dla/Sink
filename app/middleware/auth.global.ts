import type { VerifyResponse } from '@/types'

const ADMIN_PAGES = ['/dashboard/migrate', '/dashboard/users', '/dashboard/audit']

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server)
    return

  if (!to.path.startsWith('/dashboard'))
    return

  const { setAuthSession, clearAuthSession } = useAuthSession()

  try {
    const response = await useAPI<VerifyResponse>('/api/verify')
    setAuthSession(response)

    if (to.path === '/dashboard/login')
      return navigateTo('/dashboard')

    if (ADMIN_PAGES.some(page => to.path.startsWith(page)) && response.userRole !== 'admin')
      return navigateTo('/dashboard/links')
  }
  catch {
    clearAuthSession()
    if (to.path !== '/dashboard/login')
      return abortNavigation()
  }
})

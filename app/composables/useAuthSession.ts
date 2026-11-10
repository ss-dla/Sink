import type { AuthMethod, UserRole, VerifyResponse } from '@/types'
import { readonly, useState } from '#imports'

export function useAuthSession() {
  const authMethod = useState<AuthMethod | null>('auth-method', () => null)
  const userID = useState<string | null>('user-id', () => null)
  const userEmail = useState<string | null>('user-email', () => null)
  const userRole = useState<UserRole | null>('user-role', () => null)
  const accessEnabled = useState('access-enabled', () => false)

  function setAuthSession(response: VerifyResponse) {
    authMethod.value = response.authMethod
    userID.value = response.userID
    userEmail.value = response.userEmail
    userRole.value = response.userRole
    accessEnabled.value = response.accessEnabled
  }

  function clearAuthSession() {
    authMethod.value = null
    userID.value = null
    userEmail.value = null
    userRole.value = null
    accessEnabled.value = false
  }

  return {
    authMethod: readonly(authMethod),
    userID: readonly(userID),
    userEmail: readonly(userEmail),
    userRole: readonly(userRole),
    accessEnabled: readonly(accessEnabled),
    setAuthSession,
    clearAuthSession,
  }
}

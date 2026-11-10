export type AuthMethod = 'site-token' | 'access-user' | 'access-service' | 'google-session'

export type UserRole = 'admin' | 'editor'

export interface VerifyResponse {
  name: string
  url: string
  authMethod: AuthMethod
  userID: string
  userEmail: string
  userRole: UserRole
  accessEnabled: boolean
}

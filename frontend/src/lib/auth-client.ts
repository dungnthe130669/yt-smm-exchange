import { createAuthClient } from 'better-auth/client'

export const authClient = createAuthClient({
  baseURL: window.location.origin, // Pages Functions proxy /api/auth → worker
})

export const signInWithGoogle = (callbackURL = '/feed') =>
  authClient.signIn.social({ provider: 'google', callbackURL })

export const signOut = () => authClient.signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/login' } } })

export const getSession = () => authClient.getSession()

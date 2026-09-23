import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { UserProfile } from '@syncevent/shared'
import type { RootState } from '../../store/store'

interface AuthState {
  user: UserProfile | null
  accessToken: string | null
}

// SSR guard: this module loads inside app/providers.tsx ("use client"), which Next.js
// still renders once on the server to produce the initial HTML — localStorage doesn't
// exist there. Browser hydration re-runs this module client-side with the real values.
const initialState: AuthState = {
  user: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') ?? 'null') : null,
  accessToken: typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{
        user: UserProfile
        accessToken: string
      }>
    ) => {
      state.user = action.payload.user
      state.accessToken = action.payload.accessToken
      localStorage.setItem('accessToken', action.payload.accessToken)
      localStorage.setItem('user', JSON.stringify(action.payload.user))
    },
    updateAccessToken: (
      state,
      action: PayloadAction<{ accessToken: string }>
    ) => {
      state.accessToken = action.payload.accessToken
      localStorage.setItem('accessToken', action.payload.accessToken)
    },
    logout: (state) => {
      state.user = null
      state.accessToken = null
      localStorage.removeItem('accessToken')
      localStorage.removeItem('user')
    },
  },
})

export const { setCredentials, updateAccessToken, logout } = authSlice.actions
export default authSlice.reducer

export const selectCurrentUser = (state: RootState) => state.auth.user
export const selectIsAuthenticated = (state: RootState) => !!state.auth.accessToken

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from '../../store/store'

// Only the credential lives here, and only in memory. The user is server data — it lives
// in the RTK Query cache (getProfile). The session survives a reload via the httpOnly
// refresh cookie + bootstrap (features/auth/session.ts), never via browser storage.
interface AuthState {
  accessToken: string | null
  // 'idle' / 'pending' = "don't know who you are yet" — render a skeleton, not "Sign In".
  bootstrapStatus: 'idle' | 'pending' | 'done'
}

const initialState: AuthState = {
  accessToken: null,
  bootstrapStatus: 'idle',
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAccessToken: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload
    },
    logout: (state) => {
      state.accessToken = null
    },
    bootstrapStarted: (state) => {
      state.bootstrapStatus = 'pending'
    },
    bootstrapFinished: (state) => {
      state.bootstrapStatus = 'done'
    },
  },
})

export const { setAccessToken, logout, bootstrapStarted, bootstrapFinished } = authSlice.actions
export default authSlice.reducer

export const selectAccessToken = (state: RootState) => state.auth.accessToken
export const selectBootstrapStatus = (state: RootState) => state.auth.bootstrapStatus

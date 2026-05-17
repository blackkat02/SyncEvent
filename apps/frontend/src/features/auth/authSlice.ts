import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { UserProfile } from '@syncevent/shared'
import type { RootState } from '../../store/store'

interface AuthState {
  user: UserProfile | null
  accessToken: string | null
  refreshToken: string | null
}

const initialState: AuthState = {
  user: JSON.parse(localStorage.getItem('user') ?? 'null'),
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
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
        refreshToken: string
      }>
    ) => {
      state.user = action.payload.user
      state.accessToken = action.payload.accessToken
      state.refreshToken = action.payload.refreshToken
      localStorage.setItem('accessToken', action.payload.accessToken)
      localStorage.setItem('refreshToken', action.payload.refreshToken)
      localStorage.setItem('user', JSON.stringify(action.payload.user))
    },
    logout: (state) => {
      state.user = null
      state.accessToken = null
      state.refreshToken = null
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
    },
  },
})

export const { setCredentials, logout } = authSlice.actions
export default authSlice.reducer

export const selectCurrentUser = (state: RootState) => state.auth.user
export const selectIsAuthenticated = (state: RootState) => !!state.auth.accessToken
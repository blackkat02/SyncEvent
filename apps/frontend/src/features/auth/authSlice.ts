import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { UserProfile } from '@syncevent/shared'
import type { RootState } from '../../store/store'

interface AuthState {
  user: UserProfile | null
  accessToken: string | null
}

const initialState: AuthState = {
  user: JSON.parse(localStorage.getItem('user') ?? 'null'),
  accessToken: localStorage.getItem('accessToken'),
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
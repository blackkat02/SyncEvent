import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { LoginDto, RegisterDto, AuthResponse, UserProfile } from '@syncevent/shared'

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL,
    prepareHeaders: (headers, { getState }) => {
      const state = getState() as { auth: { accessToken: string | null } }
      const token = state.auth.accessToken
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return headers
    },
  }),
  endpoints: (builder) => ({
    login: builder.mutation<AuthResponse, LoginDto>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
    }),

    register: builder.mutation<AuthResponse, RegisterDto>({
      query: (userData) => ({
        url: '/auth/register',
        method: 'POST',
        body: userData,
      }),
    }),

    getProfile: builder.query<UserProfile, void>({
      query: () => '/auth/profile',
    }),
  }),
})

export const {
  useLoginMutation,
  useRegisterMutation,
  useGetProfileQuery,
} = authApi
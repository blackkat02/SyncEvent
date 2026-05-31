import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { LoginDto, RegisterDto, AuthResponse, UserProfile } from '@syncevent/shared';
import { logout, updateAccessToken } from './authSlice';
import type { RootState } from '../../store/store'

interface ApiWrapper<T> {
  success: boolean;
  data: T;
  message: string;
}

const baseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {

  let result = await baseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    console.warn('⚠️ Access token expired. Attempting to refresh...');

    try {
      const response = await fetch('http://localhost:3000/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const jsonResponse = await response.json()
        const { accessToken } = jsonResponse.data

        api.dispatch(updateAccessToken({ accessToken }))

        const reauthedArgs = typeof args === 'string'
          ? { url: args, headers: { authorization: `Bearer ${accessToken}` } }
          : {
            ...args,
            headers: {
              ...(args.headers || {}),
              authorization: `Bearer ${accessToken}`,
            },
          }

        result = await baseQuery(reauthedArgs, api, extraOptions)
      } else {
        api.dispatch(logout())
      }
    } catch (fetchError) {
      console.error('🚨 Network error during token refresh:', fetchError);
      api.dispatch(logout());
    }
  }

  return result;
};

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    login: builder.mutation<AuthResponse, LoginDto>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      transformResponse: (response: ApiWrapper<AuthResponse>) => response.data,
    }),

    register: builder.mutation<AuthResponse, RegisterDto>({
      query: (userData) => ({
        url: '/auth/register',
        method: 'POST',
        body: userData,
      }),
      transformResponse: (response: ApiWrapper<AuthResponse>) => response.data,
    }),

    getProfile: builder.query<UserProfile, void>({
      query: () => '/auth/profile',
      transformResponse: (response: ApiWrapper<UserProfile>) => response.data,
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useGetProfileQuery,
} = authApi;
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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) return null;

        const jsonResponse = await response.json();
        return jsonResponse.data.accessToken as string;
      } catch (fetchError) {
        console.error('🚨 Network error during token refresh:', fetchError);
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {

  let result = await baseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    console.warn('⚠️ Access token expired. Attempting to refresh...');

    const accessToken = await refreshAccessToken();

    if (accessToken) {
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

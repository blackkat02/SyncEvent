import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  BaseQueryApi,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query';
import type { AppDispatch, RootState } from '@/store/store';
import { API_BASE_URL } from '@/features/api/config';
import {
  bootstrapSession,
  isRefreshing,
  refreshSession,
  waitForRefresh,
} from '@/features/auth/session';

export interface ApiWrapper<T> {
  success: boolean;
  data: T;
  message: string;
}

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

// Auth endpoints where 401 means "bad credentials / no session cookie", not "expired
// access token". Refreshing on /auth/logout would rotate the very session being closed.
const NO_REAUTH_URLS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
]);

const urlOf = (args: string | FetchArgs) => (typeof args === 'string' ? args : args.url);

const tokenOf = (api: BaseQueryApi) => (api.getState() as RootState).auth.accessToken;

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const dispatch = api.dispatch as AppDispatch;

  // Nothing leaves before we know who the user is, and nothing is sent with a token
  // that is about to be replaced.
  await bootstrapSession(dispatch);
  await waitForRefresh();

  const tokenUsed = tokenOf(api);
  const result = await baseQuery(args, api, extraOptions);

  if (result.error?.status !== 401 || NO_REAUTH_URLS.has(urlOf(args))) {
    return result;
  }

  // Anonymous after bootstrap: there is no session to refresh.
  if (tokenUsed === null) return result;

  // Someone else is refreshing right now — wait for them and retry once.
  if (isRefreshing()) {
    await waitForRefresh();
    return baseQuery(args, api, extraOptions);
  }

  // A refresh already happened while this request was in flight: the 401 is stale.
  if (tokenOf(api) !== tokenUsed) {
    return baseQuery(args, api, extraOptions);
  }

  const refreshed = await refreshSession(dispatch);

  // prepareHeaders reads the new token from state — exactly one retry.
  return refreshed ? baseQuery(args, api, extraOptions) : result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Profile', 'Event'],
  endpoints: () => ({}),
});

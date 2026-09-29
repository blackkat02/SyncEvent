import type { AppDispatch } from '../../store/store';
import type { ApiWrapper } from '../api/baseApi';
import { API_BASE_URL, IS_DEV } from '../api/config';
import { bootstrapFinished, bootstrapStarted, logout, setAccessToken } from './authSlice';

// Single-flight /auth/refresh. The promise settles only after the new token (or logout)
// is already in state, so anyone awaiting it retries with the fresh token.
// Taking the slot is synchronous (`??=`): no await between "is it free?" and "take it".
let inflightRefresh: Promise<boolean> | null = null;

export const isRefreshing = () => inflightRefresh !== null;

export const waitForRefresh = async () => {
  while (inflightRefresh) await inflightRefresh;
};

export function refreshSession(dispatch: AppDispatch): Promise<boolean> {
  inflightRefresh ??= (async () => {
    try {
      const accessToken = await fetchNewAccessToken();
      if (accessToken) dispatch(setAccessToken(accessToken));
      else dispatch(logout());
      return accessToken !== null;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

// Once per page load: the access token lives only in memory, so after a reload the
// session is restored from the httpOnly refresh cookie. Idempotent — StrictMode's double
// effect and the first API request share the same promise.
let bootstrap: Promise<void> | null = null;

export function bootstrapSession(dispatch: AppDispatch): Promise<void> {
  bootstrap ??= (async () => {
    dispatch(bootstrapStarted());
    await refreshSession(dispatch);
    dispatch(bootstrapFinished());
  })();
  return bootstrap;
}

// Plain fetch on purpose: going through baseQuery would recurse into the reauth wrapper.
async function fetchNewAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) return null;

    const json = (await response.json()) as ApiWrapper<{ accessToken: string }>;
    return json.data.accessToken;
  } catch (error) {
    if (IS_DEV) console.error('Token refresh failed:', error);
    return null;
  }
}

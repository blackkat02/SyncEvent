import type { LoginDto, RegisterDto, LoginResponse, UserProfile } from '@syncevent/shared';
import { type ApiWrapper, baseApi} from "@/features/api/baseApi";
import type { AppDispatch } from '@/store/store';
import { setAccessToken } from './authSlice';
import { broadcastAuth } from './authChannel';

// Side effect of a successful login/register lives with the request, not in a component:
// runs once per mutation, regardless of which component fired it or whether it's still mounted.
//
// Invalidation is done here, not via `invalidatesTags`: that fires on the `fulfilled` action,
// i.e. before this handler has stored the token, so the refetch could go out anonymously.
// Here the order is explicit — token first, then refetch. Who "I" am changed, so refetch the
// profile and every event whose per-user fields (isJoined) were cached for the old identity.
const storeAccessToken = async (
  _arg: unknown,
  { dispatch, queryFulfilled }: {
    dispatch: AppDispatch
    queryFulfilled: Promise<{ data: LoginResponse }>
  },
) => {
  try {
    const { data } = await queryFulfilled;
    dispatch(setAccessToken(data.accessToken));
    dispatch(baseApi.util.invalidateTags(['Profile', 'Event']));
    broadcastAuth({ type: 'login' });
  } catch {
    // Failed login/register: the component shows the error via the mutation state.
  }
};

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginDto>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      transformResponse: (response: ApiWrapper<LoginResponse>) => response.data,
      onQueryStarted: storeAccessToken,
    }),

    register: builder.mutation<LoginResponse, RegisterDto>({
      query: (userData) => ({
        url: '/auth/register',
        method: 'POST',
        body: userData,
      }),
      transformResponse: (response: ApiWrapper<LoginResponse>) => response.data,
      onQueryStarted: storeAccessToken,
    }),

    getProfile: builder.query<UserProfile, void>({
      query: () => '/auth/profile',
      transformResponse: (response: ApiWrapper<UserProfile>) => response.data,
      providesTags: ['Profile'],
    }),

    logout: builder.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useGetProfileQuery,
  useLogoutMutation,
} = authApi;

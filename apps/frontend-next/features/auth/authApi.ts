import type { LoginDto, RegisterDto, LoginResponse, UserProfile } from '@syncevent/shared';
import { type ApiWrapper, baseApi} from "@/features/api/baseApi";

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginDto>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      transformResponse: (response: ApiWrapper<LoginResponse>) => response.data,
    }),

    register: builder.mutation<LoginResponse, RegisterDto>({
      query: (userData) => ({
        url: '/auth/register',
        method: 'POST',
        body: userData,
      }),
      transformResponse: (response: ApiWrapper<LoginResponse>) => response.data,
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

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { EventResponse, EventDetailResponse, CreateEventInput, UpdateEventInput } from '@syncevent/shared'
import type { RootState } from '../../store/store'

interface ApiWrapper<T> {
  success: boolean
  data: T
  message: string
}

export const eventsApi = createApi({
  reducerPath: 'eventsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL,
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return headers
    },
  }),
  tagTypes: ['Event', 'MyEvents'],
  endpoints: (builder) => ({
    getEvents: builder.query<EventResponse[], void>({
      query: () => '/events',
      transformResponse: (response: ApiWrapper<EventResponse[]>) => response.data,
      providesTags: ['Event'],
    }),

    getEventById: builder.query<EventDetailResponse, string>({
      query: (id) => `/events/${id}`,
      transformResponse: (response: ApiWrapper<EventDetailResponse>) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'Event', id }],
    }),

    getMyCalendar: builder.query<EventResponse[], void>({
      query: () => '/events/me/calendar',
      transformResponse: (response: ApiWrapper<EventResponse[]>) => response.data,
      providesTags: ['MyEvents'],
    }),

    createEvent: builder.mutation<EventResponse, CreateEventInput>({
      query: (body) => ({ url: '/events', method: 'POST', body }),
      invalidatesTags: ['Event'],
    }),

    updateEvent: builder.mutation<EventResponse, { id: string; body: UpdateEventInput }>({
      query: ({ id, body }) => ({
        url: `/events/${id}`,
        method: 'PATCH',
        body
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Event', id: 'LIST' },
        { type: 'Event', id }
      ],
    }),

    deleteEvent: builder.mutation<void, string>({
      query: (id) => ({ url: `/events/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Event'],
    }),

    joinEvent: builder.mutation<void, string>({
      query: (id) => ({ url: `/events/${id}/join`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Event', id }, 'MyEvents'],
    }),

    leaveEvent: builder.mutation<void, string>({
      query: (id) => ({ url: `/events/${id}/leave`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Event', id }, 'MyEvents'],
    }),
  }),
})

export const {
  useGetEventsQuery,
  useGetEventByIdQuery,
  useGetMyCalendarQuery,
  useCreateEventMutation,
  useUpdateEventMutation,
  useDeleteEventMutation,
  useJoinEventMutation,
  useLeaveEventMutation,
} = eventsApi
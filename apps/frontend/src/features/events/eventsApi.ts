import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type {
  Event,
  CreateEventDto,
  UpdateEventDto,
} from '@syncevent/shared'
import type { RootState } from '../../store/store'

export const eventsApi = createApi({
  reducerPath: 'eventsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL,
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return headers
    },
  }),
  // Теги для інвалідації кешу
  tagTypes: ['Event', 'MyEvents'],
  endpoints: (builder) => ({
    // GET /events
    getEvents: builder.query<Event[], void>({
      query: () => '/events',
      providesTags: ['Event'],
    }),

    // GET /events/:id
    getEventById: builder.query<Event, string>({
      query: (id) => `/events/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Event', id }],
    }),

    // GET /events/me/calendar
    getMyEvents: builder.query<Event[], void>({
      query: () => '/events/me/calendar',
      providesTags: ['MyEvents'],
    }),

    // POST /events
    createEvent: builder.mutation<Event, CreateEventDto>({
      query: (body) => ({
        url: '/events',
        method: 'POST',
        body,
      }),
      // Після створення — оновити список подій
      invalidatesTags: ['Event'],
    }),

    // PATCH /events/:id
    updateEvent: builder.mutation<Event, { id: string; body: UpdateEventDto }>({
      query: ({ id, body }) => ({
        url: `/events/${id}`,
        method: 'PATCH',
        body,
      }),
      // Оновити і список і конкретну подію
      invalidatesTags: (_result, _error, { id }) => [
        'Event',
        { type: 'Event', id },
      ],
    }),

    // DELETE /events/:id
    deleteEvent: builder.mutation<void, string>({
      query: (id) => ({
        url: `/events/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Event'],
    }),

    // POST /events/:id/join
    joinEvent: builder.mutation<void, string>({
      query: (id) => ({
        url: `/events/${id}/join`,
        method: 'POST',
      }),
      // Оновити конкретну подію і особистий календар
      invalidatesTags: (_result, _error, id) => [
        { type: 'Event', id },
        'MyEvents',
      ],
    }),

    // POST /events/:id/leave
    leaveEvent: builder.mutation<void, string>({
      query: (id) => ({
        url: `/events/${id}/leave`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Event', id },
        'MyEvents',
      ],
    }),
  }),
})

export const {
  useGetEventsQuery,
  useGetEventByIdQuery,
  useGetMyEventsQuery,
  useCreateEventMutation,
  useUpdateEventMutation,
  useDeleteEventMutation,
  useJoinEventMutation,
  useLeaveEventMutation,
} = eventsApi
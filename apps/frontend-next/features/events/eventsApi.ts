import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import type { EventResponse, EventDetailResponse, CreateEventInput, UpdateEventInput } from '@syncevent/shared'
import type { RootState } from '../../store/store'
import type { PaginatedResponse, PaginationQueryParams } from '@syncevent/shared';

interface ApiWrapper<T> {
  success: boolean
  data: T
  message: string
}

/** POST /events/:id/join now queues the write (backend booking-concurrency.md Phase 1) instead of doing it inline. */
interface JoinAcceptedResponse {
  requestId: string
  statusUrl: string
}

/** Mirrors apps/backend/src/booking/booking-status.service.ts BookingRequestStatus. */
type BookingRequestStatus =
  | { state: 'PENDING'; eventId: string; userId: string }
  | { state: 'CONFIRMED'; eventId: string; userId: string }
  | { state: 'REJECTED'; eventId: string; userId: string; reason: string }

const JOIN_POLL_INTERVAL_MS = 400
const JOIN_POLL_TIMEOUT_MS = 15_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One idempotency key per event while a join is in flight: a double-click or
 * a component remount reuses it, so the backend dedupes to the same queued
 * job instead of enqueueing a second one. Cleared once the request settles.
 */
const inflightJoinKeys = new Map<string, string>()

export const eventsApi = createApi({
  reducerPath: 'eventsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_URL,
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return headers
    },
  }),
  tagTypes: ['Event', 'MyEvents'],
  endpoints: (builder) => ({
    getEvents: builder.query<PaginatedResponse<EventResponse>, PaginationQueryParams | void>({
      query: (params) => ({
        url: '/events',
        method: 'GET',
        params: params || {},
      }),

      transformResponse: (response: ApiWrapper<PaginatedResponse<EventResponse>>) => {
        return response.data;
      },

      providesTags: (result) =>
        result
          ? [
            { type: 'Event', id: 'LIST' },
            ...result.data.map(({ id }) => ({ type: 'Event' as const, id })),
          ]
          : [{ type: 'Event', id: 'LIST' }],
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

    // The request is queued (202 + requestId), not applied inline, so this
    // polls GET /events/join-requests/:requestId until the worker settles it
    // (design doc: docs/architecture/booking-concurrency.md Phase 1).
    joinEvent: builder.mutation<void, string>({
      queryFn: async (id, _api, _extraOptions, baseQuery) => {
        const idempotencyKey = inflightJoinKeys.get(id) ?? crypto.randomUUID()
        inflightJoinKeys.set(id, idempotencyKey)
        try {
          const enqueue = await baseQuery({
            url: `/events/${id}/join`,
            method: 'POST',
            headers: { 'Idempotency-Key': idempotencyKey },
          })
          if (enqueue.error) return { error: enqueue.error }

          const { requestId } = (enqueue.data as ApiWrapper<JoinAcceptedResponse>).data
          const deadline = Date.now() + JOIN_POLL_TIMEOUT_MS

          while (Date.now() < deadline) {
            const poll = await baseQuery({ url: `/events/join-requests/${requestId}` })
            if (poll.error) return { error: poll.error }

            const status = (poll.data as ApiWrapper<BookingRequestStatus>).data

            if (status.state === 'CONFIRMED') return { data: undefined }
            if (status.state === 'REJECTED') {
              return {
                error: {
                  status: 409,
                  data: { message: status.reason },
                } as FetchBaseQueryError,
              }
            }
            await sleep(JOIN_POLL_INTERVAL_MS)
          }

          return {
            error: {
              status: 'TIMEOUT_ERROR',
              error: 'Still processing your request — please check back shortly.',
            } as FetchBaseQueryError,
          }
        } finally {
          inflightJoinKeys.delete(id)
        }
      },
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

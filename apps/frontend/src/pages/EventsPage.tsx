import { useState } from "react";
import {
  useGetEventsQuery,
  useJoinEventMutation,
  useLeaveEventMutation,
} from "../features/events/eventsApi";
import { useAppSelector } from "../store/hooks";
import { selectCurrentUser } from "../features/auth/authSlice";
import { EventCard } from "../features/events/components/EventCard";
import type { EventResponse, PaginationQueryParams } from "@syncevent/shared";

export const EventsPage = () => {
  const [page, setPage] = useState<number>(1);
  const limit = 3;
  const queryParams: PaginationQueryParams = { page, limit };
  const {
    data: responseData,
    isLoading,
    isError,
    isFetching,
  } = useGetEventsQuery(queryParams);
  const [joinEvent] = useJoinEventMutation();
  const [leaveEvent] = useLeaveEventMutation();
  const currentUser = useAppSelector(selectCurrentUser);

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );

  if (isError)
    return (
      <p className="text-center text-red-500 py-20">Failed to load events.</p>
    );

  const events = responseData?.data || [];
  const meta = responseData?.meta;

  return (
    <div className="space-y-8">
      <section className="text-center md:text-left py-4">
        <h2 className="text-3xl font-extrabold text-gray-900 mb-2">
          Discover Events
        </h2>
        <p className="text-gray-500 text-lg">
          Find and join exciting events happening around you
        </p>
      </section>

      <div
        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200 ${isFetching ? "opacity-50" : "opacity-100"}`}
      >
        {events.length > 0 ? (
          events.map((event: EventResponse) => (
            <EventCard
              key={event.id}
              event={event}
              currentUserId={currentUser?.id}
              onJoin={() => joinEvent(event.id)}
              onLeave={() => leaveEvent(event.id)}
            />
          ))
        ) : (
          <p className="col-span-full text-center text-gray-500 py-10">
            No events found.
          </p>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex justify-center items-center space-x-4 pt-6 border-t border-gray-100">
          <button
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page === 1 || isFetching}
            className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>

          <span className="text-sm text-gray-700">
            Page <span className="font-semibold">{meta.currentPage}</span> of{" "}
            <span className="font-semibold">{meta.totalPages}</span>
          </span>

          <button
            onClick={() =>
              setPage((prev) => Math.min(prev + 1, meta.totalPages))
            }
            disabled={page === meta.totalPages || isFetching}
            className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

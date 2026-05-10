import {
  useGetEventsQuery,
  useJoinEventMutation,
  useLeaveEventMutation,
} from "../features/events/eventsApi";
import { useAppSelector } from "../store/hooks";
import { selectCurrentUser } from "../features/auth/authSlice";
import { EventCard } from "../features/events/components/EventCard";

export const EventsPage = () => {
  const { data: events, isLoading, isError } = useGetEventsQuery();
  const [joinEvent] = useJoinEventMutation();
  const [leaveEvent] = useLeaveEventMutation();
  const currentUser = useAppSelector(selectCurrentUser);
  const isOrganizer = event.authorId === currentUser?.id;

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events?.map((event) => {
          const isJoined = event.participants.some(
            (p) => p.id === currentUser?.id,
          );
          const isFull =
            event.capacity !== null &&
            event.participants.length >= event.capacity;
          const isOrganizer = event.organizerId === currentUser?.id;

          return (
            <EventCard
              key={event.id}
              title={event.title}
              description={event.description}
              date={new Date(event.date).toLocaleDateString()}
              time={new Date(event.date).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              location={event.location}
              participants={event.participants.length}
              capacity={event.capacity}
              isJoined={isJoined}
              isFull={isFull}
              isOrganizer={isOrganizer}
              onJoin={() => joinEvent(event.id)}
              onLeave={() => leaveEvent(event.id)}
            />
          );
        })}
      </div>
    </div>
  );
};

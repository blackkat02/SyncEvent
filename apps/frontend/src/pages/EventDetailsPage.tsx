import { useParams, useNavigate } from "react-router-dom";
import {
  useGetEventByIdQuery,
  useDeleteEventMutation,
  useJoinEventMutation,
  useLeaveEventMutation,
} from "../features/events/eventsApi";
import { useAppSelector } from "../store/hooks";
import { selectCurrentUser } from "../features/auth/authSlice";

export const EventDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectCurrentUser);

  const { data: event, isLoading, isError } = useGetEventByIdQuery(id!);
  const [deleteEvent] = useDeleteEventMutation();
  const [joinEvent, { isLoading: isJoining }] = useJoinEventMutation();
  const [leaveEvent, { isLoading: isLeaving }] = useLeaveEventMutation();

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );

  if (isError || !event)
    return <p className="text-center text-red-500 py-20">Event not found.</p>;

  const isOrganizer = event.authorId === currentUser?.id;
  const isFull = event.capacity
    ? event._count.participants >= event.capacity
    : false;
  const isJoined = !!event.isJoined;
  const date = new Date(event.date);

  console.log("Is isJoined:", event.isJoined);

  const handleDelete = async () => {
    if (!confirm("Delete this event?")) return;
    await deleteEvent(id!);
    navigate("/");
  };

  const handleActionClick = async () => {
    if (isJoined) {
      await leaveEvent(id!);
    } else {
      await joinEvent(id!);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-10 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-extrabold text-gray-900 leading-tight">
              {event.title}
            </h2>
            <div className="flex gap-2">
              {isOrganizer && (
                <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-md border border-blue-200 uppercase tracking-wider">
                  My Event
                </span>
              )}
              {isJoined && (
                <span className="bg-green-50 text-green-600 text-xs font-bold px-2.5 py-1 rounded-md border border-green-200 uppercase tracking-wider">
                  You are going
                </span>
              )}
              {isFull && !isJoined && (
                <span className="bg-red-50 text-red-600 text-xs font-bold px-2.5 py-1 rounded-md border border-red-200 uppercase tracking-wider">
                  Full
                </span>
              )}
            </div>
          </div>

          {isOrganizer && (
            <div className="flex gap-2 w-full md:w-auto shrink-0">
              <button
                onClick={() => navigate(`/events/${id}/edit`)}
                className="flex-1 md:flex-none px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 md:flex-none px-5 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        <p className="text-gray-600 text-lg mb-8 whitespace-pre-line">
          {event.description}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8 border-b">
          <div className="space-y-1">
            <span className="text-sm text-gray-400 uppercase font-bold tracking-wider">
              Date & Time
            </span>
            <p className="text-gray-900 font-medium text-lg">
              {date.toLocaleDateString()} at{" "}
              {date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-gray-400 uppercase font-bold tracking-wider">
              Location
            </span>
            <p className="text-gray-900 font-medium text-lg">
              {event.location}
            </p>
          </div>
        </div>

        {!isOrganizer && (
          <div className="py-6 border-b">
            <button
              disabled={(isFull && !isJoined) || isJoining || isLeaving}
              onClick={handleActionClick}
              className={`w-full md:w-auto px-8 py-3 rounded-xl font-medium text-base transition-colors ${
                isFull && !isJoined
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                  : isJoined
                    ? "bg-red-50 text-red-600 hover:bg-red-100"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              }`}
            >
              {isJoining || isLeaving
                ? "Processing..."
                : isFull && !isJoined
                  ? "No Seats Available"
                  : isJoined
                    ? "Leave Event"
                    : "Join Event"}
            </button>
          </div>
        )}

        <div className="pt-8">
          <h4 className="text-xl font-bold mb-4 text-gray-900">
            Participants ({event._count.participants}
            {event.capacity ? ` / ${event.capacity}` : ""})
          </h4>
          <div className="flex flex-wrap gap-2">
            {event.participants?.map((p) => {
              const isAuthor = p.id === event.authorId;
              return (
                <div
                  key={p.id}
                  className={`px-4 py-2 rounded-full text-sm font-medium border ${
                    isAuthor
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-gray-50 text-gray-700 border-gray-200"
                  }`}
                >
                  {p.displayName ?? p.email}
                  {isAuthor && " (Organizer)"}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

import { useParams, useNavigate } from "react-router-dom";
import {
  useGetEventByIdQuery,
  useDeleteEventMutation,
} from "../features/events/eventsApi";
import { useAppSelector } from "../store/hooks";
import { selectCurrentUser } from "../features/auth/authSlice";

export const EventDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUser = useAppSelector(selectCurrentUser);
  const { data: event, isLoading, isError } = useGetEventByIdQuery(id!);
  const [deleteEvent] = useDeleteEventMutation();

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );

  if (isError || !event)
    return <p className="text-center text-red-500 py-20">Event not found.</p>;

  const isOrganizer = event.authorId === currentUser?.id;
  const date = new Date(event.date);

  const handleDelete = async () => {
    if (!confirm("Delete this event?")) return;
    await deleteEvent(id!);
    navigate("/");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-10 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
          <h2 className="text-3xl font-extrabold text-gray-900">
            {event.title}
          </h2>
          {isOrganizer && (
            <div className="flex gap-2 w-full md:w-auto">
              <button
                onClick={() => navigate(`/events/${id}/edit`)}
                className="flex-1 md:flex-none px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 md:flex-none px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        <p className="text-gray-600 text-lg mb-8">{event.description}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8 border-b">
          <div className="space-y-1">
            <span className="text-sm text-gray-400 uppercase font-bold">
              Date & Time
            </span>
            <p className="text-gray-900 font-medium">
              {date.toLocaleDateString()} at{" "}
              {date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-sm text-gray-400 uppercase font-bold">
              Location
            </span>
            <p className="text-gray-900 font-medium">{event.location}</p>
          </div>
          {event.capacity && (
            <div className="space-y-1">
              <span className="text-sm text-gray-400 uppercase font-bold">
                Capacity
              </span>
              <p className="text-gray-900 font-medium">
                {event._count.participants} / {event.capacity}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

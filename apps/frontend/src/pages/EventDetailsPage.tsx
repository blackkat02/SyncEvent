import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Edit3,
  Trash2,
} from "lucide-react";
import {
  useGetEventByIdQuery,
  useDeleteEventMutation,
  useJoinEventMutation,
  useLeaveEventMutation,
} from "../features/events/eventsApi";
import { useAppSelector } from "../store/hooks";
import { selectCurrentUser } from "../features/auth/authSlice";
import type { EventResponse } from "@syncevent/shared";

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
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-red-500 text-lg font-medium">Event not found.</p>
        <Link
          to="/"
          className="text-blue-600 hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft size={16} /> Back to discover
        </Link>
      </div>
    );

  const isOrganizer = event.authorId === currentUser?.id;
  const isFull = event.capacity
    ? event._count.participants >= event.capacity
    : false;
  const isJoined = !!event.isJoined;
  const date = new Date(event.date);

  const handleDelete = async () => {
    if (!confirm("Are you absolutely sure you want to delete this event?"))
      return;
    try {
      await deleteEvent(id!).unwrap();
      navigate("/");
    } catch (err) {
      alert("Failed to delete event");
    }
  };

  const handleActionClick = async () => {
    try {
      if (isJoined) {
        await leaveEvent(id!).unwrap();
      } else {
        await joinEvent(id!).unwrap();
      }
    } catch (err) {
      console.error("Action failed:", err);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to events
      </button>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b pb-6">
          <div className="space-y-3">
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight leading-tight">
              {event.title}
            </h2>
            <div className="flex flex-wrap gap-2">
              {isOrganizer && (
                <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-md border border-blue-200 uppercase tracking-wider">
                  My Event
                </span>
              )}
              {isJoined && (
                <span className="bg-green-50 text-green-700 text-xs font-bold px-2.5 py-1 rounded-md border border-green-200 uppercase tracking-wider">
                  You are going
                </span>
              )}
              {isFull && !isJoined && (
                <span className="bg-red-50 text-red-700 text-xs font-bold px-2.5 py-1 rounded-md border border-red-200 uppercase tracking-wider">
                  Full
                </span>
              )}
            </div>
          </div>

          {isOrganizer && (
            <div className="flex gap-2 w-full sm:w-auto shrink-0">
              <button
                onClick={() => navigate(`/events/${id}/edit`)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors text-gray-700"
              >
                <Edit3 size={14} />
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
            About Event
          </h3>
          <p className="text-gray-600 text-base md:text-lg leading-relaxed whitespace-pre-line">
            {event.description || "No description provided for this event."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
          <div className="flex items-start gap-3">
            <Calendar className="text-gray-400 mt-1 shrink-0" size={20} />
            <div className="space-y-0.5">
              <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">
                Date & Time
              </span>
              <p className="text-gray-900 font-semibold">
                {date.toLocaleDateString()} at{" "}
                {date.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="text-gray-400 mt-1 shrink-0" size={20} />
            <div className="space-y-0.5">
              <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">
                Location
              </span>
              <p className="text-gray-900 font-semibold">{event.location}</p>
            </div>
          </div>
        </div>

        {!isOrganizer && (
          <div className="pt-2">
            <button
              disabled={(isFull && !isJoined) || isJoining || isLeaving}
              onClick={handleActionClick}
              className={`w-full sm:w-auto px-10 py-3 rounded-xl font-semibold text-base transition-all ${
                isFull && !isJoined
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                  : isJoined
                    ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow"
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

        <div className="pt-6 border-t border-gray-100">
          <h4 className="text-lg font-bold mb-4 text-gray-900 flex items-center gap-2">
            <Users size={18} className="text-gray-500" />
            Participants ({event._count.participants}
            {event.capacity ? ` / ${event.capacity}` : ""})
          </h4>

          {event.participants && event.participants.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {event.participants.map((p) => {
                const isAuthor = p.id === event.authorId;
                return (
                  <div
                    key={p.id}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      isAuthor
                        ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                        : "bg-gray-50 text-gray-700 border-gray-200"
                    }`}
                  >
                    {p.displayName ?? p.email}
                    {isAuthor && " 👑"}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              No participants yet. Be the first to join!
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

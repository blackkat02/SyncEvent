import { useNavigate } from "react-router-dom";
import type { EventResponse } from "@syncevent/shared";

interface EventCardProps {
  event: EventResponse;
  currentUserId?: string;
  onJoin: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDelete: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const EventCard = ({
  event,
  currentUserId,
  onJoin,
  onLeave,
  onDelete,
}: EventCardProps) => {
  const navigate = useNavigate();

  const isOrganizer = !!currentUserId && event.authorId === currentUserId;
  const isFull = event.capacity
    ? event._count.participants >= event.capacity
    : false;

  const eventDate = new Date(event.date).toLocaleDateString();
  const eventTime = new Date(event.date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col h-full"
      onClick={() => navigate(`/events/${event.id}`)}
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-gray-900 leading-tight">
          {event.title}
        </h3>

        <div className="flex flex-col gap-1 items-end ml-2 shrink-0">
          {isFull && !event.isJoined && (
            <span className="bg-red-50 text-red-600 text-[10px] font-extrabold px-2 py-1 rounded-md uppercase tracking-wider border border-red-200">
              Full
            </span>
          )}

          {event.isJoined && (
            <span className="bg-green-50 text-green-600 text-[10px] font-extrabold px-2 py-1 rounded-md uppercase tracking-wider border border-green-200">
              Going
            </span>
          )}

          {isOrganizer && (
            <span className="bg-blue-50 text-blue-600 text-[10px] font-extrabold px-2 py-1 rounded-md uppercase tracking-wider border border-blue-200">
              My Event
            </span>
          )}
        </div>
      </div>

      <p className="text-gray-500 text-sm mb-6 line-clamp-3 grow">
        {event.description}
      </p>

      <div className="space-y-2 mb-6">
        <div className="flex items-center text-sm text-gray-600 gap-2">
          <span className="font-medium">{eventDate}</span>
          <span className="text-gray-400">•</span>
          <span>{eventTime}</span>
        </div>

        <div className="text-sm text-gray-600 truncate">{event.location}</div>

        <div className="text-sm font-semibold text-blue-600">
          {event._count.participants}{" "}
          {event.capacity ? `/ ${event.capacity}` : ""} participants
        </div>
      </div>

      {isOrganizer && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/events/${event.id}/edit`);
              console.log("Edit clicked");
            }}
            className="text-gray-500 hover:text-blue-600 text-xs px-3 py-1.5 rounded-lg border border-gray-200 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              // ТУТ в майбутньому буде onDelete?.()
              console.log("Delete clicked");
            }}
            className="text-gray-500 hover:text-red-600 text-xs px-3 py-1.5 rounded-lg border border-gray-200 transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {!isOrganizer && (
        <button
          disabled={isFull && !event.isJoined}
          onClick={(e) => {
            e.stopPropagation();
            event.isJoined ? onLeave(e) : onJoin(e);
          }}
          className={`w-full py-2.5 rounded-xl font-medium transition-colors ${
            isFull && !event.isJoined
              ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
              : event.isJoined
                ? "bg-red-50 text-red-600 hover:bg-red-100"
                : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {isFull && !event.isJoined
            ? "Full"
            : event.isJoined
              ? "Leave Event"
              : "Join Event"}
        </button>
      )}
    </div>
  );
};

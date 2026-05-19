import { useNavigate } from "react-router-dom";
import type { EventResponse } from "@syncevent/shared";

interface EventCardProps {
  event: EventResponse;
  // title: string;
  // description: string | null;
  // date: string;
  // time: string;
  // location: string;
  // participants: number;
  // capacity: number | null;
  // authorId: string;
  currentUserId?: string;
  // isJoined: boolean;
  onJoin: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const EventCard = ({
  event,
  // title,
  // description,
  // date,
  // time,
  // location,
  // participants,
  // capacity,
  // authorId,
  currentUserId,
  // isJoined,
  onJoin,
  onLeave,
}: EventCardProps) => {
  const navigate = useNavigate();

  const isOrganizer = !!currentUserId && event.authorId === currentUserId;
  const isFull = event.capacity
    ? event._count.participants >= event.capacity
    : false;

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => navigate(`/events/${event.id}`)}
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-gray-900 leading-tight">
          {event.title}
        </h3>

        {isFull && !isJoined && (
          <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded uppercase">
            Full
          </span>
        )}
      </div>

      <p className="text-gray-500 text-sm mb-6 line-clamp-3 grow">
        {description}
      </p>

      <div className="space-y-2 mb-6">
        <div className="flex items-center text-sm text-gray-600 gap-2">
          <span className="font-medium">{date}</span>
          <span className="text-gray-400">•</span>
          <span>{time}</span>
        </div>
        <div className="text-sm text-gray-600 truncate">{location}</div>
        <div className="text-sm font-semibold text-blue-600">
          {participants} {capacity ? `/ ${capacity}` : ""} participants
        </div>
      </div>

      {isOrganizer && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
            className="text-gray-400 hover:text-blue-600 text-xs px-2 py-1 rounded border border-gray-200"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className="text-gray-400 hover:text-red-600 text-xs px-2 py-1 rounded border border-gray-200"
          >
            Delete
          </button>
        </div>
      )}

      <button
        disabled={isFull && !isJoined}
        onClick={(e) => {
          e.stopPropagation();
          isJoined ? onLeave() : onJoin();
        }}
        className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
          isFull && !isJoined
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : isJoined
              ? "bg-red-50 text-red-600 hover:bg-red-100"
              : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {isFull && !isJoined ? "Full" : isJoined ? "Leave Event" : "Join Event"}
      </button>
    </div>
  );
};

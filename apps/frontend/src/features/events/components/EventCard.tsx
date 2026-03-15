interface EventCardProps {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  participants: number;
  capacity?: number;
}

export const EventCard = ({
  title,
  description,
  date,
  time,
  location,
  participants,
  capacity,
}: EventCardProps) => {
  const isFull = capacity && participants >= capacity;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-gray-900 leading-tight">
          {title}
        </h3>
        {isFull && (
          <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded uppercase">
            Full [cite: 26]
          </span>
        )}
      </div>

      <p className="text-gray-500 text-sm mb-6 line-clamp-3 flex-grow">
        {description} [cite: 20]
      </p>

      <div className="space-y-2 mb-6">
        <div className="flex items-center text-sm text-gray-600 gap-2">
          <span className="font-medium">{date} [cite: 20, 132]</span>
          <span className="text-gray-400">•</span>
          <span>{time} [cite: 133]</span>
        </div>
        <div className="text-sm text-gray-600 truncate">
          📍 {location} [cite: 21]
        </div>
        <div className="text-sm font-semibold text-blue-600">
          {participants}
          {capacity ? `/${capacity}` : ""} participants [cite: 23, 135]
        </div>
      </div>

      <button
        disabled={isFull}
        className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
          isFull
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {isFull ? "Full" : "Join Event"} [cite: 24, 26, 148]
      </button>
    </div>
  );
};

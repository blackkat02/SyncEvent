import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarHeaderProps {
  currentDate: Date;
  viewMode: "month" | "week";
  onPrev: () => void;
  onNext: () => void;
  onViewModeChange: (mode: "month" | "week") => void;
}

export const CalendarHeader = ({
  currentDate,
  viewMode,
  onPrev,
  onNext,
  onViewModeChange,
}: CalendarHeaderProps) => {
  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
        <h2 className="text-2xl font-bold text-gray-900 min-w-50">
          {viewMode === "month"
            ? format(currentDate, "MMMM yyyy")
            : `Week of ${format(currentDate, "MMM dd, yyyy")}`}
        </h2>
        <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous period"
            className="p-2.5 hover:bg-gray-50 border-r text-gray-600 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next period"
            className="p-2.5 hover:bg-gray-50 text-gray-600 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
        {(["month", "week"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewModeChange(mode)}
            className={`flex-1 md:px-6 py-2 text-sm font-bold rounded-lg transition-all capitalize ${
              viewMode === mode
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>
    </div>
  );
};

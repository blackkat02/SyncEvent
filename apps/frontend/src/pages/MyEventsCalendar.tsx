import { useState, useMemo } from "react";
import { useGetMyCalendarQuery } from "../features/events/eventsApi";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameDay,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
} from "date-fns";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { CalendarHeader } from "../features/calendar/components/CalendarHeader";

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MyEventsCalendar = () => {
  const navigate = useNavigate();
  const { data: events = [] } = useGetMyCalendarQuery();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  const daysGrid = useMemo(() => {
    if (viewMode === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(monthStart);
      return eachDayOfInterval({
        start: startOfWeek(monthStart, { weekStartsOn: 0 }),
        end: endOfWeek(monthEnd, { weekStartsOn: 0 }),
      });
    } else {
      return eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
      });
    }
  }, [currentDate, viewMode]);

  const groupedEvents = useMemo(() => {
    const map: Record<string, typeof events> = {};

    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    sortedEvents.forEach((event) => {
      const dateKey = format(new Date(event.date), "yyyy-MM-dd");
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(event);
    });
    return map;
  }, [events]);

  const handlePrev = () => {
    setCurrentDate((prev) =>
      viewMode === "month" ? subMonths(prev, 1) : subWeeks(prev, 1),
    );
  };

  const handleNext = () => {
    setCurrentDate((prev) =>
      viewMode === "month" ? addMonths(prev, 1) : addWeeks(prev, 1),
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-4 py-4">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Events</h2>
          <p className="text-sm text-gray-500">
            View and manage your event calendar
          </p>
        </div>
        <button
          onClick={() => navigate("/events/create")}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-blue-700 shadow-sm transition-colors"
        >
          <Plus size={16} /> Create Event
        </button>
      </div>

      <CalendarHeader
        currentDate={currentDate}
        viewMode={viewMode}
        onPrev={handlePrev}
        onNext={handleNext}
        onViewModeChange={setViewMode}
      />

      <div className="grid grid-cols-7 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
        {WEEK_DAYS.map((day) => (
          <div key={day} className="py-2">
            {day}
          </div>
        ))}
      </div>

      {viewMode === "month" ? (
        <div className="grid grid-cols-7 border-t border-l border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
          {daysGrid.map((day, idx) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayEvents = groupedEvents[dateKey] || [];
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={idx}
                className={`border-r border-b min-h-27.5 p-2 flex flex-col justify-between transition-all ${
                  !isCurrentMonth
                    ? "bg-gray-50/50 opacity-40 border-gray-200"
                    : isToday
                      ? "bg-blue-50/20 border-blue-500 ring-1 ring-blue-500 ring-inset" // ✅ Додали синій бордюр та внутрішнє кільце
                      : "hover:bg-gray-50/30 border-gray-200"
                }`}
              >
                <div className="flex justify-start h-6 items-center">
                  <span
                    className={`text-xs font-bold flex items-center justify-center transition-all ${
                      isToday
                        ? "text-white bg-blue-600 w-5 h-5 rounded-full shadow-sm"
                        : isCurrentMonth
                          ? "text-gray-700"
                          : "text-gray-400"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                <div className="space-y-1 mt-2 flex-1 flex flex-col justify-end overflow-hidden">
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/events/${event.id}`);
                      }}
                      className="bg-blue-50 text-blue-700 border border-blue-100 rounded-md p-1 text-[10px] font-bold truncate cursor-pointer hover:bg-blue-100 transition-colors"
                    >
                      {format(new Date(event.date), "HH:mm")} - {event.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-3">
          {daysGrid.map((day, idx) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayEvents = groupedEvents[dateKey] || [];
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={idx}
                className={`bg-white border rounded-xl p-4 min-h-45 flex flex-col justify-between shadow-sm transition-all ${
                  isToday
                    ? "border-blue-500 ring-1 ring-blue-500"
                    : "border-gray-200"
                }`}
              >
                <div>
                  <span
                    className={`block text-xs font-black ${isToday ? "text-blue-600 border rounded-xl" : "text-gray-900"}`}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                <div className="flex-1 flex flex-col justify-end mt-2 space-y-1.5 overflow-hidden">
                  {dayEvents.length > 0 ? (
                    dayEvents.map((event) => (
                      <div
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/events/${event.id}`);
                        }}
                        className="bg-blue-50 border border-blue-100 text-blue-700 rounded-lg p-2 text-[11px] font-bold cursor-pointer hover:bg-blue-100 transition-colors"
                      >
                        <span className="block text-[9px] text-blue-500 mb-0.5">
                          {format(new Date(event.date), "HH:mm")}
                        </span>
                        <span className="line-clamp-2 leading-tight">
                          {event.title}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-[11px] text-gray-400 italic block pb-1">
                      No events
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

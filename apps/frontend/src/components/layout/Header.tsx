import { Link, useLocation } from "react-router-dom";
import { UserBar } from "../UserBar/UserBar";
import { LayoutList, CalendarDays, Plus } from "lucide-react";

export const Header = () => {
  const location = useLocation();

  const isActive = (path: string) =>
    location.pathname === path
      ? "text-blue-600 font-semibold"
      : "text-gray-600 hover:text-blue-600";

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Link
            to="/"
            className="text-xl font-bold text-blue-600 tracking-tight"
          >
            SyncEvent
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/"
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive("/")}`}
            >
              <LayoutList size={16} />
              Events
            </Link>
            <Link
              to="/my-events"
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive("/my-events")}`}
            >
              <CalendarDays size={16} />
              My Events
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link
            to="/events/create"
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Create Event
          </Link>
          <UserBar />
        </div>
      </div>
    </header>
  );
};

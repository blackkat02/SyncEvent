import { Link } from "react-router-dom";

export const Header = () => {
  return (
    <header className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="flex items-center gap-10">
        <h1 className="text-xl font-bold text-blue-600 tracking-tighter">
          RADENCY
        </h1>
        <nav className="hidden md:flex gap-6 text-sm font-medium text-gray-500">
          <a href="/" className="hover:text-blue-600">
            Events
          </a>
          <a href="/my-events" className="hover:text-blue-600">
            My Events
          </a>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <a
          href="/events/create"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Create Event
        </a>
        <div className="flex items-center gap-2 pl-4 border-l">
          <span className="text-sm font-semibold text-gray-700">eduard</span>
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">
            ED
          </div>
        </div>
      </div>
    </header>
  );
};

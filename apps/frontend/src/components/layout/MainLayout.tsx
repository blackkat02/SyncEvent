import { Outlet, Link, useNavigate } from "react-router-dom";

export const Header = () => {
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
              className="text-sm font-medium text-gray-600 hover:text-blue-600"
            >
              Events
            </Link>
            <Link
              to="/my-events"
              className="text-sm font-medium text-gray-600 hover:text-blue-600"
            >
              My Events
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link
            to="/events/create"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + Create Event
          </Link>
          <div className="h-8 w-px bg-gray-200 mx-2" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">eduard</span>
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs border border-blue-200">
              ED
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export const MainLayout = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Тут рендериться активна сторінка через Router */}
        <Outlet />
      </main>
    </div>
  );
};

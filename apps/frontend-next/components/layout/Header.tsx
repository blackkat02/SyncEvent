"use client";
// useState (mobile menu) + usePathname (active-link highlighting) both
// require the client boundary.

import { useState } from "react";
// react-router's <Link> + useLocation map onto two different Next.js APIs:
// <Link> comes from "next/link" (a separate package, prop is `href` not
// `to`), while the "what's the current path" hook is `usePathname` from
// "next/navigation" — it returns the pathname string directly, not an
// object with a `.pathname` field.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserBar } from "@/components/UserBar/UserBar";
import { LayoutList, CalendarDays, Plus, Menu, X } from "lucide-react";

export const Header = () => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const isActive = (path: string) =>
    pathname === path
      ? "text-blue-600 font-semibold md:bg-transparent bg-blue-50 text-blue-700"
      : "text-gray-600 hover:text-blue-600 hover:bg-gray-50 md:hover:bg-transparent";

  const closeMenu = () => setIsOpen(false);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6 lg:gap-10">
          <Link
            href="/"
            onClick={closeMenu}
            className="text-xl font-bold text-blue-600 tracking-tight"
          >
            SyncEvent
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/"
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive("/")}`}
            >
              <LayoutList size={16} />
              Events
            </Link>
            <Link
              href="/my-events"
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive("/my-events")}`}
            >
              <CalendarDays size={16} />
              My Events
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <Link
            href="/events/create"
            onClick={closeMenu}
            className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white p-2 sm:px-4 sm:py-2 rounded-lg text-sm font-medium transition-colors h-9 sm:h-10"
            title="Create Event"
          >
            <Plus size={16} />
            <span className="hidden sm:inline ml-1.5">Create Event</span>
          </Link>

          <div className="flex items-center">
            <UserBar />
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-lg text-gray-600 hover:text-blue-600 hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="md:hidden border-b border-gray-200 bg-white absolute top-16 left-0 w-full shadow-lg z-40">
          <nav className="flex flex-col p-4 space-y-1">
            <Link
              href="/"
              onClick={closeMenu}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-base font-medium transition-all ${isActive("/")}`}
            >
              <LayoutList size={18} />
              Events
            </Link>
            <Link
              href="/my-events"
              onClick={closeMenu}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-base font-medium transition-all ${isActive("/my-events")}`}
            >
              <CalendarDays size={18} />
              My Events
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
};

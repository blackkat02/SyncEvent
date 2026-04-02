import React, { useEffect, useState } from "react";
import apiClient from "../../api/client";
import { UserProfile } from "@syncevent/shared";

const UserBar: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await apiClient.get<UserProfile>("/auth/profile");
        setUser(userData);
      } catch (error) {
        // У майбутньому тут буде редирект на логін
        console.error("Failed to fetch user:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 animate-pulse">
        <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
        <div className="w-24 h-4 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <button className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors">
        Sign In
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 p-2 rounded-full hover:bg-gray-100 cursor-pointer transition-colors group">
      {/* Аватарка з обгорткою для ефекту */}
      <div className="relative w-10 h-10 overflow-hidden rounded-full ring-2 ring-indigo-100 group-hover:ring-indigo-200 transition-all">
        <img
          src={user.avatarUrl || "/default-avatar.png"} // Тимчасово, поки немає дефолтної
          alt={user.displayName}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Блок з текстом */}
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
          {user.displayName}
        </span>
        <span className="text-xs text-gray-500">My Account</span>
      </div>
    </div>
  );
};

export default UserBar;

import { useGetProfileQuery } from "../../features/auth/authApi";
import { useAppSelector, useAppDispatch } from "../../store/hooks";
import {
  selectIsAuthenticated,
  selectCurrentUser,
  setCredentials,
} from "../../features/auth/authSlice";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export const UserBar: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const cachedUser = useAppSelector(selectCurrentUser);

  const { data: user, isLoading } = useGetProfileQuery(undefined, {
    skip: !isAuthenticated,
  });

  // Синхронізуємо профіль з Redux після завантаження
  useEffect(() => {
    if (user && !cachedUser) {
      dispatch(
        setCredentials({
          user,
          accessToken: localStorage.getItem("accessToken") ?? "",
          refreshToken: localStorage.getItem("refreshToken") ?? "",
        }),
      );
    }
  }, [user, cachedUser, dispatch]);

  const displayUser = cachedUser ?? user;

  if (isLoading)
    return <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />;

  if (!displayUser)
    return (
      <button
        onClick={() => navigate("/auth/login")}
        className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
      >
        Sign In
      </button>
    );

  return (
    <div className="flex items-center gap-3 p-2 rounded-full hover:bg-gray-100 cursor-pointer">
      <div className="relative w-10 h-10 overflow-hidden rounded-full ring-2 ring-indigo-100">
        <img
          src={
            displayUser.avatarUrl ??
            `https://ui-avatars.com/api/?name=${encodeURIComponent(displayUser.displayName ?? displayUser.email)}`
          }
          alt={displayUser.displayName ?? displayUser.email}
          className="w-full h-full object-cover"
        />
      </div>
      <span className="text-sm font-medium text-gray-700">
        {displayUser.displayName ?? displayUser.email}
      </span>
    </div>
  );
};

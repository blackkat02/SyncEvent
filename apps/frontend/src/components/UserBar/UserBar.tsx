import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAppSelector, useAppDispatch } from "../../store/hooks";
import { useGetProfileQuery, useLogoutMutation } from "../../features/auth/authApi";
import { selectAccessToken, selectBootstrapStatus } from "../../features/auth/authSlice";
import { broadcastAuth, clearLocalSession } from "../../features/auth/authChannel";

export const UserBar: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const bootstrapStatus = useAppSelector(selectBootstrapStatus);
  const hasToken = useAppSelector(selectAccessToken) !== null;
  const { data: user, isLoading } = useGetProfileQuery(undefined, {
    skip: bootstrapStatus !== "done" || !hasToken,
  });
  const [logoutRequest, { isLoading: isLoggingOut }] = useLogoutMutation();

  // Server first (the cookie still goes out with the request), then local cleanup —
  // always, even offline or on 500: the user asked to leave, the UI must obey.
  const handleLogout = async () => {
    try {
      await logoutRequest().unwrap();
    } catch {
      // Server-side revoke failed; the cookie expires on its own. Still log out locally.
    } finally {
      clearLocalSession(dispatch);
      broadcastAuth({ type: "logout" });
      navigate("/auth/login");
    }
  };

  // Until bootstrap finishes we don't know who the user is: skeleton, not "Sign In".
  if (bootstrapStatus !== "done" || isLoading)
    return <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />;

  if (!user)
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
            user.avatarUrl ??
            `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName ?? user.email)}`
          }
          // Decorative: the name is already rendered as text right next to it.
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
      <span className="text-sm font-medium text-gray-700 hidden md:inline">
        {user.displayName ?? user.email}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          void handleLogout();
        }}
        disabled={isLoggingOut}
        className="p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Sign out"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
};

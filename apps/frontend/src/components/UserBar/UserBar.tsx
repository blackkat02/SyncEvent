import { useGetProfileQuery } from "../../features/auth/authApi";
import { useAppSelector } from "../../store/hooks";
import { selectIsAuthenticated } from "../../features/auth/authSlice";
import { useNavigate } from "react-router-dom";

export const UserBar: React.FC = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  const { data: user, isLoading } = useGetProfileQuery(undefined, {
    skip: !isAuthenticated,
  });

  if (isLoading)
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
            `https://ui-avatars.com/api/?name=${user.displayName}`
          }
          alt={user.displayName ?? user.email}
          className="w-full h-full object-cover"
        />
      </div>
      <span className="text-sm font-medium text-gray-700">
        {user.displayName ?? user.email}
      </span>
    </div>
  );
};

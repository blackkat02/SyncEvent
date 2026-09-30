import { useAppSelector } from "../../store/hooks";
import { useGetProfileQuery } from "./authApi";
import { selectAccessToken } from "./authSlice";

// The only way to ask "who am I": the getProfile cache, requested only while we hold a token.
export const useCurrentUser = () => {
  const hasToken = useAppSelector(selectAccessToken) !== null;
  return useGetProfileQuery(undefined, { skip: !hasToken });
};

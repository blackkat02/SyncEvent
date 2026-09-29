import { useEffect } from "react";
import { useAppDispatch } from "../../store/hooks";
import { bootstrapSession } from "./session";
import { subscribeToAuthChannel } from "./authChannel";

// Restores the session from the refresh cookie once per page load. Renders nothing.
// Needed even though the first API request also triggers bootstrap: an anonymous page
// may send no auth-dependent request at all, and bootstrapStatus must still reach 'done'.
export function AuthBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    void bootstrapSession(dispatch);
  }, [dispatch]);

  // Login/logout in another tab of this origin.
  useEffect(() => subscribeToAuthChannel(dispatch), [dispatch]);

  return null;
}

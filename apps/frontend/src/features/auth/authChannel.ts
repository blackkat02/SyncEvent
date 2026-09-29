import type { AppDispatch } from "../../store/store";
import { baseApi } from "../api/baseApi";
import { logout } from "./authSlice";
import { refreshSession } from "./session";

// Cross-tab auth sync. The access token lives in each tab's memory, so tabs must be told
// explicitly when the (shared) cookie session starts or ends.
// Payloads carry the event only — NEVER a token: every tab gets its own via /auth/refresh.
type AuthMessage = { type: "logout" } | { type: "login" };

const CHANNEL_NAME = "syncevent-auth";

// One channel object per tab, used for both sending and receiving: BroadcastChannel does not
// deliver a message back to the object that posted it, so a tab never reacts to its own event.
let channel: BroadcastChannel | null = null;

export const broadcastAuth = (message: AuthMessage) => {
  channel?.postMessage(message);
};

// What "logged out" means locally: no token, no cached server data of the previous user.
export const clearLocalSession = (dispatch: AppDispatch) => {
  dispatch(logout());
  dispatch(baseApi.util.resetApiState());
};

// Opens the channel and reacts to other tabs. Call from an effect; the returned function
// is the effect cleanup.
export function subscribeToAuthChannel(dispatch: AppDispatch): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};

  const own = new BroadcastChannel(CHANNEL_NAME);
  channel = own;

  own.onmessage = async (event: MessageEvent<AuthMessage>) => {
    switch (event.data?.type) {
      case "logout":
        clearLocalSession(dispatch);
        break;
      case "login":
        // Adopt the new cookie session (possibly a different user) first, then drop the
        // cache so mounted queries refetch under the new identity.
        await refreshSession(dispatch);
        dispatch(baseApi.util.resetApiState());
        break;
    }
  };

  return () => {
    own.close();
    if (channel === own) channel = null;
  };
}

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export const useIsHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
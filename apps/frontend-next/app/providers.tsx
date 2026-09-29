"use client";

import { Provider } from "react-redux";
import { store } from "../store/store";
import { AuthBootstrap } from "@/features/auth/AuthBootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <AuthBootstrap />
      {children}
    </Provider>
  );
}

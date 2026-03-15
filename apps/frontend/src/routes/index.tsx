import { createBrowserRouter } from "react-router-dom";
import { MainLayout } from "../components/layout/MainLayout";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { path: "/", element: <div>Events List (Public)</div> },
      { path: "/events/:id", element: <div>Event Details</div> },
      { path: "/events/create", element: <div>Create Event</div> },
      { path: "/my-events", element: <div>My Events (Calendar)</div> },
    ],
  },
  {
    path: "/auth",
    children: [
      { path: "login", element: <div>Login Page</div> },
      { path: "register", element: <div>Register Page</div> },
    ],
  },
]);

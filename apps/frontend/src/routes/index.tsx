import { createBrowserRouter } from "react-router-dom";
import { MainLayout } from "../components/layout/MainLayout";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { EventsPage } from "../pages/EventsPage";
import { EventDetailsPage } from "../pages/EventDetailsPage";
import { MyEventsPage } from "../pages/MyEventsPage";
import { CreateEventPage } from "../pages/CreateEventPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { index: true, element: <EventsPage /> },
      { path: "events/:id", element: <EventDetailsPage /> },
      { path: "events/create", element: <CreateEventPage /> },
      { path: "my-events", element: <MyEventsPage /> },
    ],
  },
  {
    path: "/auth",
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
    ],
  },
]);

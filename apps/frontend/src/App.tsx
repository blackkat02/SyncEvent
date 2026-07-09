import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";
import { RegisterPage } from "./pages/RegisterPage";
import { LoginPage } from "./pages/LoginPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<div>Events List Page</div>} />
          <Route path="events/:id" element={<div>Event Details</div>} />
          <Route path="events/create" element={<div>Create Event</div>} />
          <Route path="my-events" element={<div>My Events (Calendar)</div>} />
        </Route>
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/login" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

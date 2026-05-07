import { Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import SeoLandingPage from "./pages/SeoLandingPage";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/should-i-book-hotel-now-or-wait" element={<SeoLandingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { BrowserRouter, Routes, Route } from "react-router";
import { Provider } from "react-redux";
import { store } from "./store/index.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { AuthGate } from "./components/AuthGate.js";
import { GamePage } from "./pages/GamePage.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { NavHeader } from "./components/NavHeader.js";
import { JoinPage } from "./pages/JoinPage.js";
import { AnalysisPage } from "./pages/AnalysisPage.js";
import { TrainingPage } from "./pages/TrainingPage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";

export function AppRoutes() {
  return (
    <>
      <NavHeader />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/game/:id"
          element={
            <ProtectedRoute>
              <GamePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/join/:inviteToken"
          element={
            <ProtectedRoute>
              <JoinPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analysis/:gameId"
          element={
            <ProtectedRoute>
              <AnalysisPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/training"
          element={
            <ProtectedRoute>
              <TrainingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/:id"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <AuthGate>
          <AppRoutes />
        </AuthGate>
      </BrowserRouter>
    </Provider>
  );
}

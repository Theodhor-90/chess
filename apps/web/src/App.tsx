import { BrowserRouter, Routes, Route } from "react-router";
import { Provider } from "react-redux";
import { store } from "./store/index.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { AuthGate } from "./components/AuthGate.js";
import { GamePage } from "./pages/GamePage.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { Layout } from "./components/Layout.js";
import { JoinPage } from "./pages/JoinPage.js";
import { AnalysisPage } from "./pages/AnalysisPage.js";
import { TrainingPage } from "./pages/TrainingPage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { DatabasePage } from "./pages/DatabasePage.js";
import { DatabaseGameViewerPage } from "./pages/DatabaseGameViewerPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { BotSelectPage } from "./pages/BotSelectPage.js";
import { PuzzlePage } from "./pages/PuzzlePage.js";
import { RepertoireListPage } from "./pages/RepertoireListPage.js";
import { RepertoireBuilderPage } from "./pages/RepertoireBuilderPage.js";

export function AppRoutes() {
  return (
    <Routes>
      {/* Auth pages render without the Layout shell */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* All other pages render inside the Layout shell */}
      <Route element={<Layout />}>
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
        <Route path="/database" element={<DatabasePage />} />
        <Route path="/database/games/:id/view" element={<DatabaseGameViewerPage />} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/play/bot"
          element={
            <ProtectedRoute>
              <BotSelectPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/puzzles"
          element={
            <ProtectedRoute>
              <PuzzlePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/repertoires"
          element={
            <ProtectedRoute>
              <RepertoireListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/repertoires/:id"
          element={
            <ProtectedRoute>
              <RepertoireBuilderPage />
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
      </Route>
    </Routes>
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

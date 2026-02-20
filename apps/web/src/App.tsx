import { BrowserRouter, Routes, Route } from "react-router";
import { Provider } from "react-redux";
import { store } from "./store/index.js";
import Board from "./components/Board.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { AuthGate } from "./components/AuthGate.js";
import { GamePage } from "./pages/GamePage.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";

export function AppRoutes() {
  return (
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
        path="/"
        element={
          <ProtectedRoute>
            <div>
              <h1>Chess Platform</h1>
              <Board />
            </div>
          </ProtectedRoute>
        }
      />
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

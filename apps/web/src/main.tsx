import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/board-themes/blue.css";
import "./styles/board-themes/green.css";
import "./styles/board-themes/ic.css";
import "./styles/piece-themes/merida.css";
import "./styles/piece-themes/alpha.css";
import "./styles/piece-themes/california.css";
import "./styles/puzzle-highlights.css";
import "./styles/training-highlights.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./components/ThemeProvider.js";
import { BoardThemeProvider } from "./components/BoardThemeProvider.js";
import { ToastProvider } from "./components/ui/ToastProvider.js";
import { App } from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <BoardThemeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BoardThemeProvider>
    </ThemeProvider>
  </StrictMode>,
);

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router";
import { useRouteChangeFocus } from "../src/hooks/useRouteChangeFocus.js";

afterEach(() => {
  cleanup();
});

function TestApp() {
  useRouteChangeFocus();
  const navigate = useNavigate();
  return (
    <div>
      <main id="main-content" tabIndex={-1} data-testid="main-content">
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/other" element={<div>Other</div>} />
        </Routes>
      </main>
      <button type="button" onClick={() => navigate("/other")} data-testid="nav-button">
        Go
      </button>
    </div>
  );
}

describe("useRouteChangeFocus", () => {
  it("does not move focus on initial render", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <TestApp />
      </MemoryRouter>,
    );
    expect(document.activeElement).not.toBe(screen.getByTestId("main-content"));
  });

  it("moves focus to main-content on route change", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <TestApp />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("nav-button"));
    expect(document.activeElement).toBe(screen.getByTestId("main-content"));
  });
});

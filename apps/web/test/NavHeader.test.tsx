import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "../src/store/apiSlice.js";
import { gameReducer } from "../src/store/gameSlice.js";
import { socketMiddleware } from "../src/store/socketMiddleware.js";
import { NavHeader } from "../src/components/NavHeader.js";

vi.mock("../src/socket.js", () => ({
  connectSocket: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    connected: true,
    disconnect: vi.fn(),
  })),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => null),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createTestStore() {
  return configureStore({
    reducer: {
      [apiSlice.reducerPath]: apiSlice.reducer,
      game: gameReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(apiSlice.middleware, socketMiddleware),
  });
}

function renderWithProviders(ui: React.ReactElement, { route = "/" } = {}) {
  const store = createTestStore();
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="*" element={ui} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    ),
  };
}

function mockFetchSuccess(body: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockFetchError(body: unknown, status: number) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("NavHeader", () => {
  it("shows user email and logout button when authenticated", async () => {
    mockFetchSuccess({ user: { id: 1, email: "player@test.com" } });
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getByTestId("user-email")).toHaveTextContent("player@test.com");
    });
    expect(screen.getByTestId("logout-button")).toBeInTheDocument();
  });

  it("shows Login link when not authenticated", async () => {
    mockFetchError({ error: "Unauthorized" }, 401);
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Login" })).toBeInTheDocument();
    });
    expect(screen.queryByTestId("logout-button")).not.toBeInTheDocument();
  });

  it("app title links to home", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getByTestId("nav-header")).toBeInTheDocument();
    });
    const titleLink = screen.getByRole("link", { name: "Chess Platform" });
    expect(titleLink).toHaveAttribute("href", "/");
  });

  it("logout button calls logout and navigates to /login", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<NavHeader />} />
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("logout-button")).toBeInTheDocument();
    });
    mockFetchSuccess({});
    mockFetchError({ error: "Unauthorized" }, 401);
    fireEvent.click(screen.getByTestId("logout-button"));
    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
  });
});

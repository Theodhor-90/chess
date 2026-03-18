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
  it("shows username and logout button when authenticated", async () => {
    mockFetchSuccess({ user: { id: 1, email: "player@test.com", username: "player_one" } });
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getByTestId("user-display-name")).toHaveTextContent("player_one");
    });
    expect(screen.getAllByRole("button", { name: "Logout" }).length).toBeGreaterThan(0);
  });

  it("shows Login link when not authenticated", async () => {
    mockFetchError({ error: "Unauthorized" }, 401);
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: "Login" }).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();
  });

  it("app title links to home", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com", username: "player_one" } });
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getByTestId("nav-header")).toBeInTheDocument();
    });
    const titleLink = screen.getByRole("link", { name: "Chess Platform" });
    expect(titleLink).toHaveAttribute("href", "/");
  });

  it("logout button calls logout and navigates to /login", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com", username: "player_one" } });
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
      expect(screen.getAllByRole("button", { name: "Logout" }).length).toBeGreaterThan(0);
    });
    mockFetchSuccess({});
    mockFetchError({ error: "Unauthorized" }, 401);
    fireEvent.click(screen.getAllByRole("button", { name: "Logout" })[0]);
    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
  });

  it("renders hamburger button with correct ARIA attributes", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com", username: "player_one" } });
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getByTestId("hamburger-button")).toBeInTheDocument();
    });
    const hamburger = screen.getByTestId("hamburger-button");
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    expect(hamburger).toHaveAttribute("aria-controls", "mobile-nav-menu");
    expect(hamburger).toHaveAttribute("aria-label", "Open menu");
  });

  it("toggles menu open on hamburger click", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com", username: "player_one" } });
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getByTestId("hamburger-button")).toBeInTheDocument();
    });
    const hamburger = screen.getByTestId("hamburger-button");

    fireEvent.click(hamburger);

    expect(hamburger).toHaveAttribute("aria-expanded", "true");
    expect(hamburger).toHaveAttribute("aria-label", "Close menu");

    const mobileMenu = screen.getByTestId("mobile-menu");
    expect(mobileMenu.className).toContain("mobileMenuOpen");
  });

  it("closes menu and returns focus to hamburger on Escape", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com", username: "player_one" } });
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getByTestId("hamburger-button")).toBeInTheDocument();
    });
    const hamburger = screen.getByTestId("hamburger-button");

    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(hamburger);
  });

  it("closes menu on outside click", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com", username: "player_one" } });
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getByTestId("hamburger-button")).toBeInTheDocument();
    });
    const hamburger = screen.getByTestId("hamburger-button");

    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");

    // Click outside the menu (on the document body)
    fireEvent.mouseDown(document.body);

    expect(hamburger).toHaveAttribute("aria-expanded", "false");
  });

  it("mobile menu contains all nav links", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com", username: "player_one" } });
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getByTestId("mobile-menu")).toBeInTheDocument();
    });
    const mobileMenu = screen.getByTestId("mobile-menu");
    const links = mobileMenu.querySelectorAll("a");
    const linkTexts = Array.from(links).map((l) => l.textContent);
    expect(linkTexts).toContain("Dashboard");
    expect(linkTexts).toContain("History");
    expect(linkTexts).toContain("Training");
    expect(linkTexts).toContain("Database");
  });

  it("mobile menu shows username link when authenticated", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com", username: "player_one" } });
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getByTestId("mobile-user-link")).toBeInTheDocument();
    });
    expect(screen.getByTestId("mobile-user-link")).toHaveTextContent("player_one");
  });

  it("closes menu on navigation (route change)", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com", username: "player_one" } });
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="*" element={<NavHeader />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("hamburger-button")).toBeInTheDocument();
    });

    const hamburger = screen.getByTestId("hamburger-button");
    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");

    // Click a nav link in the mobile menu to trigger navigation
    const mobileMenu = screen.getByTestId("mobile-menu");
    const historyLink = Array.from(mobileMenu.querySelectorAll("a")).find(
      (a) => a.textContent === "History",
    );
    expect(historyLink).toBeTruthy();
    fireEvent.click(historyLink!);

    await waitFor(() => {
      expect(hamburger).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("focuses first menu link when menu opens", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com", username: "player_one" } });
    renderWithProviders(<NavHeader />);
    await waitFor(() => {
      expect(screen.getByTestId("hamburger-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("hamburger-button"));

    await waitFor(() => {
      const mobileMenu = screen.getByTestId("mobile-menu");
      const firstLink = mobileMenu.querySelector("a");
      expect(document.activeElement).toBe(firstLink);
    });
  });
});

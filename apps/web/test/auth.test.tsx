import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { LoginPage } from "../src/pages/LoginPage.js";
import { RegisterPage } from "../src/pages/RegisterPage.js";
import { AppRoutes } from "../src/App.js";
import { ProtectedRoute } from "../src/components/ProtectedRoute.js";
import { apiSlice } from "../src/store/apiSlice.js";
import { gameReducer } from "../src/store/gameSlice.js";
import { socketMiddleware } from "../src/store/socketMiddleware.js";

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
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </Provider>,
  );
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

function getRequestUrl(request: RequestInfo | URL): string {
  if (typeof request === "string") {
    return request;
  }
  if (request instanceof URL) {
    return request.toString();
  }
  return request.url;
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders email input, password input, and submit button", () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
  });

  it("renders link to register page", () => {
    renderWithProviders(<LoginPage />);
    const links = screen.getAllByRole("link", { name: "Register" });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/register");
  });

  it("calls login and navigates to home on success", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    mockFetchSuccess([]);
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/login"]}>
          <AppRoutes />
        </MemoryRouter>
      </Provider>,
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    const buttons = screen.getAllByRole("button", { name: "Login" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getAllByText("Chess Platform").length).toBeGreaterThanOrEqual(1);
    });
    expect(globalThis.fetch).toHaveBeenCalled();
    const loginCall = vi
      .mocked(globalThis.fetch)
      .mock.calls.find(([request]) => getRequestUrl(request).includes("/api/auth/login"));
    expect(loginCall).toBeDefined();
    if (!loginCall) {
      throw new Error("Missing /api/auth/login call");
    }
    const [request, options] = loginCall;
    expect(request instanceof Request ? request.method : options?.method).toBe("POST");
  });

  it("displays error message on login failure", async () => {
    mockFetchError({ error: "Invalid email or password" }, 401);
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    const buttons = screen.getAllByRole("button", { name: "Login" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password");
    });
  });

  it("disables submit button while submitting", async () => {
    let resolveResponse!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    );
    renderWithProviders(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    const buttons = screen.getAllByRole("button", { name: "Login" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      const submitting = screen.getAllByRole("button", { name: /Logging in/ });
      expect(submitting[0]).toBeDisabled();
    });
    resolveResponse(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
});

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders email input, password input, and submit button", () => {
    renderWithProviders(<RegisterPage />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register" })).toBeInTheDocument();
  });

  it("renders link to login page", () => {
    renderWithProviders(<RegisterPage />);
    const links = screen.getAllByRole("link", { name: "Login" });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/login");
  });

  it("calls register and navigates to home on success", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } }, 201);
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    mockFetchSuccess([]);
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/register"]}>
          <AppRoutes />
        </MemoryRouter>
      </Provider>,
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    const buttons = screen.getAllByRole("button", { name: "Register" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getAllByText("Chess Platform").length).toBeGreaterThanOrEqual(1);
    });
    expect(globalThis.fetch).toHaveBeenCalled();
    const registerCall = vi
      .mocked(globalThis.fetch)
      .mock.calls.find(([request]) => getRequestUrl(request).includes("/api/auth/register"));
    expect(registerCall).toBeDefined();
    if (!registerCall) {
      throw new Error("Missing /api/auth/register call");
    }
    const [request, options] = registerCall;
    expect(request instanceof Request ? request.method : options?.method).toBe("POST");
  });

  it("displays error message on registration failure", async () => {
    mockFetchError({ error: "Email already taken" }, 409);
    renderWithProviders(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    const buttons = screen.getAllByRole("button", { name: "Register" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Email already taken");
    });
  });

  it("disables submit button while submitting", async () => {
    let resolveResponse!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    );
    renderWithProviders(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    const buttons = screen.getAllByRole("button", { name: "Register" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      const submitting = screen.getAllByRole("button", { name: /Registering/ });
      expect(submitting[0]).toBeDisabled();
    });
    resolveResponse(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
});

describe("ProtectedRoute", () => {
  it("renders children when authenticated", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );
    await waitFor(() => {
      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });
  });

  it("redirects to /login with redirect param when not authenticated", async () => {
    mockFetchError({ error: "Unauthorized" }, 401);
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/game/5"]}>
          <Routes>
            <Route
              path="/game/:id"
              element={
                <ProtectedRoute>
                  <div>Game</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    await waitFor(() => {
      expect(screen.getByText("Login Page")).toBeInTheDocument();
    });
  });

  it("shows loading state while checking auth", () => {
    let resolveResponse!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    );
    renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    resolveResponse(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
});

describe("LoginPage redirect support", () => {
  it("navigates to redirect param after successful login", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/login?redirect=%2Fsome-page"]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/some-page" element={<div>Redirected Page</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    const buttons = screen.getAllByRole("button", { name: "Login" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getByText("Redirected Page")).toBeInTheDocument();
    });
  });

  it("navigates to redirect param after successful registration", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } }, 201);
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/register?redirect=%2Fsome-page"]}>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/some-page" element={<div>Redirected Page</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    const buttons = screen.getAllByRole("button", { name: "Register" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getByText("Redirected Page")).toBeInTheDocument();
    });
  });

  it("register link preserves redirect param on RegisterPage", () => {
    renderWithProviders(<RegisterPage />, { route: "/register?redirect=%2Fgame%2F5" });
    const links = screen.getAllByRole("link", { name: "Login" });
    expect(links[0].getAttribute("href")).toContain("/login?redirect=/game/5");
  });

  it("login link preserves redirect param on LoginPage", () => {
    renderWithProviders(<LoginPage />, { route: "/login?redirect=%2Fgame%2F5" });
    const links = screen.getAllByRole("link", { name: "Register" });
    expect(links[0].getAttribute("href")).toContain("/register?redirect=/game/5");
  });
});

describe("App routing (via AppRoutes)", () => {
  it("renders LoginPage at /login", () => {
    mockFetchError({ error: "Unauthorized" }, 401);
    renderWithProviders(<AppRoutes />, { route: "/login" });
    const buttons = screen.getAllByRole("button", { name: "Login" });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders RegisterPage at /register", () => {
    mockFetchError({ error: "Unauthorized" }, 401);
    renderWithProviders(<AppRoutes />, { route: "/register" });
    const buttons = screen.getAllByRole("button", { name: "Register" });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders home page at / when authenticated", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    mockFetchSuccess([]);
    renderWithProviders(<AppRoutes />, { route: "/" });
    await waitFor(() => {
      expect(screen.getAllByText("Chess Platform").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders JoinPage at /join/:inviteToken when authenticated", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    mockFetchSuccess({ gameId: 5, status: "waiting" });
    mockFetchSuccess({
      id: 5,
      status: "active",
      players: {
        white: { userId: 1, color: "white" },
        black: { userId: 2, color: "black" },
      },
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      pgn: "",
      moves: [],
      currentTurn: "white",
      clock: { initialTime: 600, increment: 0 },
      inviteToken: "test-join-token",
      drawOffer: null,
      createdAt: 0,
    });
    renderWithProviders(<AppRoutes />, { route: "/join/test-join-token" });
    await waitFor(() => {
      expect(screen.getByText("Loading game...")).toBeInTheDocument();
    });
  });

  it("redirects /join/:inviteToken to login when not authenticated", async () => {
    mockFetchError({ error: "Unauthorized" }, 401);
    renderWithProviders(<AppRoutes />, { route: "/join/some-token" });
    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: "Login" });
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });
});

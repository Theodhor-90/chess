import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { LoginPage } from "../src/pages/LoginPage.js";
import { RegisterPage } from "../src/pages/RegisterPage.js";
import { AppRoutes } from "../src/App.js";
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
      expect(screen.getByText("Chess Platform")).toBeInTheDocument();
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [request, options] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(getRequestUrl(request)).toContain("/api/auth/login");
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
      expect(screen.getByText("Chess Platform")).toBeInTheDocument();
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [request, options] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(getRequestUrl(request)).toContain("/api/auth/register");
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

describe("App routing (via AppRoutes)", () => {
  it("renders LoginPage at /login", () => {
    renderWithProviders(<AppRoutes />, { route: "/login" });
    const buttons = screen.getAllByRole("button", { name: "Login" });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders RegisterPage at /register", () => {
    renderWithProviders(<AppRoutes />, { route: "/register" });
    const buttons = screen.getAllByRole("button", { name: "Register" });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders home page at /", () => {
    renderWithProviders(<AppRoutes />, { route: "/" });
    expect(screen.getByText("Chess Platform")).toBeInTheDocument();
  });
});

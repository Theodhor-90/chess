import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { LoginPage } from "../src/pages/LoginPage.js";
import { RegisterPage } from "../src/pages/RegisterPage.js";
import { AppRoutes } from "../src/App.js";

afterEach(() => {
  cleanup();
});

vi.mock("../src/api.js", () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}));

const { login, register } = await import("../src/api.js");
const mockLogin = vi.mocked(login);
const mockRegister = vi.mocked(register);

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email input, password input, and submit button", () => {
    renderInRouter(<LoginPage />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
  });

  it("renders link to register page", () => {
    renderInRouter(<LoginPage />);
    const links = screen.getAllByRole("link", { name: "Register" });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/register");
  });

  it("calls login and navigates to home on success", async () => {
    mockLogin.mockResolvedValueOnce({ user: { id: 1, email: "a@b.com" } });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    const buttons = screen.getAllByRole("button", { name: "Login" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getByText("Chess Platform")).toBeInTheDocument();
    });
  });

  it("displays error message on login failure", async () => {
    mockLogin.mockRejectedValueOnce(new Error("Invalid email or password"));
    renderInRouter(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    const buttons = screen.getAllByRole("button", { name: "Login" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password");
    });
  });

  it("disables submit button while submitting", async () => {
    let resolveLogin: (value: { user: { id: number; email: string } }) => void;
    mockLogin.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    renderInRouter(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    const buttons = screen.getAllByRole("button", { name: "Login" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      const submitting = screen.getAllByRole("button", { name: /Logging in/ });
      expect(submitting[0]).toBeDisabled();
    });
    resolveLogin!({ user: { id: 1, email: "a@b.com" } });
  });
});

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email input, password input, and submit button", () => {
    renderInRouter(<RegisterPage />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register" })).toBeInTheDocument();
  });

  it("renders link to login page", () => {
    renderInRouter(<RegisterPage />);
    const links = screen.getAllByRole("link", { name: "Login" });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "/login");
  });

  it("calls register and navigates to home on success", async () => {
    mockRegister.mockResolvedValueOnce({ user: { id: 1, email: "a@b.com" } });
    render(
      <MemoryRouter initialEntries={["/register"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    const buttons = screen.getAllByRole("button", { name: "Register" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getByText("Chess Platform")).toBeInTheDocument();
    });
  });

  it("displays error message on registration failure", async () => {
    mockRegister.mockRejectedValueOnce(new Error("Email already taken"));
    renderInRouter(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    const buttons = screen.getAllByRole("button", { name: "Register" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Email already taken");
    });
  });

  it("disables submit button while submitting", async () => {
    let resolveRegister: (value: { user: { id: number; email: string } }) => void;
    mockRegister.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRegister = resolve;
      }),
    );
    renderInRouter(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    const buttons = screen.getAllByRole("button", { name: "Register" });
    fireEvent.click(buttons[0]);
    await waitFor(() => {
      const submitting = screen.getAllByRole("button", { name: /Registering/ });
      expect(submitting[0]).toBeDisabled();
    });
    resolveRegister!({ user: { id: 1, email: "a@b.com" } });
  });
});

describe("App routing (via AppRoutes)", () => {
  it("renders LoginPage at /login", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    const buttons = screen.getAllByRole("button", { name: "Login" });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders RegisterPage at /register", () => {
    render(
      <MemoryRouter initialEntries={["/register"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    const buttons = screen.getAllByRole("button", { name: "Register" });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders home page at /", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText("Chess Platform")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { Toast, ToastProvider, useToast } from "../src/components/ui/index.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toast", () => {
  it("renders the message text", () => {
    render(<Toast id="1" message="Saved successfully" type="success" onDismiss={() => {}} />);
    expect(screen.getByText("Saved successfully")).toBeDefined();
  });

  it("renders with role alert", () => {
    render(<Toast id="1" message="Error occurred" type="error" onDismiss={() => {}} />);
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("calls onDismiss with the toast id when close button is clicked", () => {
    const handleDismiss = vi.fn();
    render(<Toast id="toast-42" message="Info" type="info" onDismiss={handleDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(handleDismiss).toHaveBeenCalledOnce();
    expect(handleDismiss).toHaveBeenCalledWith("toast-42");
  });

  it("renders all type variants without errors", () => {
    const types = ["success", "error", "warning", "info"] as const;
    for (const type of types) {
      const { unmount } = render(
        <Toast id={type} message={`${type} toast`} type={type} onDismiss={() => {}} />,
      );
      expect(screen.getByText(`${type} toast`)).toBeDefined();
      unmount();
    }
  });
});

describe("ToastProvider + useToast", () => {
  function wrapper({ children }: { children: ReactNode }) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  it("useToast throws when used outside ToastProvider", () => {
    expect(() => {
      renderHook(() => useToast());
    }).toThrow("useToast must be used within a ToastProvider");
  });

  it("showToast adds a toast that is visible in the DOM", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.showToast("Hello toast", "success");
    });
    expect(screen.getByText("Hello toast")).toBeDefined();
  });

  it("showToast supports multiple toasts", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.showToast("First", "success");
      result.current.showToast("Second", "error");
    });
    expect(screen.getByText("First")).toBeDefined();
    expect(screen.getByText("Second")).toBeDefined();
  });

  it("toast auto-dismisses after default duration (4000ms)", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.showToast("Auto dismiss", "info");
    });
    expect(screen.getByText("Auto dismiss")).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText("Auto dismiss")).toBeNull();
  });

  it("toast auto-dismisses after custom duration", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.showToast("Quick toast", "warning", 1000);
    });
    expect(screen.getByText("Quick toast")).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText("Quick toast")).toBeNull();
  });

  it("toast can be manually dismissed before auto-dismiss", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.showToast("Manual dismiss", "success");
    });
    expect(screen.getByText("Manual dismiss")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Manual dismiss")).toBeNull();
  });
});

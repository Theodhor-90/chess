import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AriaAnnouncer } from "../src/components/AriaAnnouncer.js";

vi.mock("../src/components/AriaAnnouncer.module.css", () => ({
  default: {
    visuallyHidden: "visuallyHidden",
  },
}));

afterEach(() => {
  cleanup();
});

describe("AriaAnnouncer", () => {
  it("renders a visually hidden container with correct ARIA attributes", () => {
    render(<AriaAnnouncer message="" />);
    const el = screen.getByTestId("aria-announcer");
    expect(el).toHaveAttribute("aria-live", "polite");
    expect(el).toHaveAttribute("role", "status");
    expect(el).toHaveAttribute("aria-atomic", "true");
    expect(el).toHaveClass("visuallyHidden");
  });

  it("displays the message when provided", () => {
    render(<AriaAnnouncer message="e4" />);
    expect(screen.getByTestId("aria-announcer")).toHaveTextContent("e4");
  });

  it("updates message when prop changes", () => {
    const { rerender } = render(<AriaAnnouncer message="e4" />);
    rerender(<AriaAnnouncer message="e5, check" />);
    expect(screen.getByTestId("aria-announcer")).toHaveTextContent("e5, check");
  });

  it("displays empty content when message is empty string", () => {
    render(<AriaAnnouncer message="" />);
    expect(screen.getByTestId("aria-announcer").textContent).toBe("");
  });
});

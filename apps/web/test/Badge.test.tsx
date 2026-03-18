import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Badge } from "../src/components/ui/index.js";

afterEach(() => {
  cleanup();
});

describe("Badge", () => {
  it("renders children text", () => {
    render(<Badge>Win</Badge>);
    expect(screen.getByText("Win")).toBeDefined();
  });

  it("renders as a span element", () => {
    render(<Badge>Status</Badge>);
    expect(screen.getByText("Status").tagName).toBe("SPAN");
  });

  it("renders with all variant values without errors", () => {
    const variants = ["success", "danger", "warning", "neutral", "info"] as const;
    for (const variant of variants) {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeDefined();
      unmount();
    }
  });

  it("renders with sm size without errors", () => {
    render(<Badge size="sm">Small</Badge>);
    expect(screen.getByText("Small")).toBeDefined();
  });

  it("renders with md size without errors", () => {
    render(<Badge size="md">Medium</Badge>);
    expect(screen.getByText("Medium")).toBeDefined();
  });

  it("applies additional className", () => {
    render(<Badge className="extra-class">Tag</Badge>);
    const badge = screen.getByText("Tag");
    expect(badge.className).toContain("extra-class");
  });

  it("renders ReactNode children", () => {
    render(
      <Badge>
        <strong data-testid="bold-text">Bold</strong>
      </Badge>,
    );
    expect(screen.getByTestId("bold-text")).toHaveTextContent("Bold");
  });
});

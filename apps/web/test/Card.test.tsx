import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Card } from "../src/components/ui/index.js";

afterEach(() => {
  cleanup();
});

describe("Card", () => {
  it("renders children content", () => {
    render(<Card>Card body</Card>);
    expect(screen.getByText("Card body")).toBeDefined();
  });

  it("renders header when provided", () => {
    render(<Card header="My Title">Content</Card>);
    expect(screen.getByText("My Title")).toBeDefined();
    expect(screen.getByText("Content")).toBeDefined();
  });

  it("does not render header section when header is not provided", () => {
    const { container } = render(<Card>Content only</Card>);
    const cardEl = container.firstElementChild!;
    expect(cardEl.children).toHaveLength(1);
  });

  it("renders header section when header is explicitly provided", () => {
    const { container } = render(<Card header="Title">Body</Card>);
    const cardEl = container.firstElementChild!;
    expect(cardEl.children).toHaveLength(2);
  });

  it("renders ReactNode as header", () => {
    render(<Card header={<span data-testid="custom-header">Custom</span>}>Body</Card>);
    expect(screen.getByTestId("custom-header")).toHaveTextContent("Custom");
  });

  it("applies additional className to the card root", () => {
    const { container } = render(<Card className="extra-class">Content</Card>);
    const cardEl = container.firstElementChild!;
    expect(cardEl.className).toContain("extra-class");
  });
});

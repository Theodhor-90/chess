import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Button } from "../src/components/ui/index.js";

afterEach(() => {
  cleanup();
});

describe("Button", () => {
  it("renders children text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button")).toHaveTextContent("Click me");
  });

  it('defaults to type="button"', () => {
    render(<Button>Test</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it('supports type="submit"', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("calls onClick when clicked", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("does not call onClick when disabled", () => {
    const handleClick = vi.fn();
    render(
      <Button onClick={handleClick} disabled>
        Click
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("renders as disabled when disabled prop is true", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders as disabled when loading is true", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders a spinner element when loading", () => {
    render(<Button loading>Saving</Button>);
    const button = screen.getByRole("button");
    const spinner = button.querySelector("[aria-hidden='true']");
    expect(spinner).not.toBeNull();
    expect(button).toHaveTextContent("Saving");
  });

  it("does not render a spinner when not loading", () => {
    render(<Button>Normal</Button>);
    const button = screen.getByRole("button");
    const spinner = button.querySelector("[aria-hidden='true']");
    expect(spinner).toBeNull();
  });

  it("does not call onClick when loading", () => {
    const handleClick = vi.fn();
    render(
      <Button onClick={handleClick} loading>
        Click
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });
});

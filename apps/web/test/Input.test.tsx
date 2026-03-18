import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Input } from "../src/components/ui/index.js";

afterEach(() => {
  cleanup();
});

describe("Input", () => {
  it("renders a label with the provided text", () => {
    render(<Input label="Email" name="email" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Email")).toBeDefined();
  });

  it("links the label to the input via htmlFor/id", () => {
    render(<Input label="Username" name="username" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Username");
    expect(input.tagName).toBe("INPUT");
  });

  it("renders the input with the provided value", () => {
    render(<Input label="Name" name="name" value="Alice" onChange={() => {}} />);
    expect(screen.getByLabelText("Name")).toHaveValue("Alice");
  });

  it('defaults to type="text"', () => {
    render(<Input label="Name" name="name" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Name")).toHaveAttribute("type", "text");
  });

  it("supports custom type", () => {
    render(<Input label="Password" name="password" value="" onChange={() => {}} type="password" />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("calls onChange when input value changes", () => {
    const handleChange = vi.fn();
    render(<Input label="Name" name="name" value="" onChange={handleChange} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bob" } });
    expect(handleChange).toHaveBeenCalledOnce();
  });

  it("renders as disabled when disabled prop is true", () => {
    render(<Input label="Name" name="name" value="" onChange={() => {}} disabled />);
    expect(screen.getByLabelText("Name")).toBeDisabled();
  });

  it("displays error message when error prop is provided", () => {
    render(<Input label="Email" name="email" value="" onChange={() => {}} error="Invalid email" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email");
  });

  it("does not display error message when error prop is not provided", () => {
    render(<Input label="Email" name="email" value="" onChange={() => {}} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders placeholder text", () => {
    render(
      <Input
        label="Email"
        name="email"
        value=""
        onChange={() => {}}
        placeholder="user@example.com"
      />,
    );
    expect(screen.getByPlaceholderText("user@example.com")).toBeDefined();
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Select } from "../src/components/ui/index.js";

const testOptions = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" },
];

afterEach(() => {
  cleanup();
});

describe("Select", () => {
  it("renders a label with the provided text", () => {
    render(
      <Select label="Color" name="color" value="" onChange={() => {}} options={testOptions} />,
    );
    expect(screen.getByLabelText("Color")).toBeDefined();
  });

  it("links the label to the select via htmlFor/id", () => {
    render(
      <Select label="Color" name="color" value="" onChange={() => {}} options={testOptions} />,
    );
    const select = screen.getByLabelText("Color");
    expect(select.tagName).toBe("SELECT");
  });

  it("renders all provided options", () => {
    render(
      <Select label="Color" name="color" value="" onChange={() => {}} options={testOptions} />,
    );
    expect(screen.getByText("Option A")).toBeDefined();
    expect(screen.getByText("Option B")).toBeDefined();
    expect(screen.getByText("Option C")).toBeDefined();
  });

  it("renders placeholder as disabled first option", () => {
    render(
      <Select
        label="Color"
        name="color"
        value=""
        onChange={() => {}}
        options={testOptions}
        placeholder="Choose a color"
      />,
    );
    const placeholder = screen.getByText("Choose a color");
    expect(placeholder.tagName).toBe("OPTION");
    expect(placeholder).toBeDisabled();
  });

  it("does not render placeholder option when placeholder is not provided", () => {
    render(
      <Select label="Color" name="color" value="a" onChange={() => {}} options={testOptions} />,
    );
    const allOptions = screen.getAllByRole("option");
    expect(allOptions).toHaveLength(3);
  });

  it("selects the correct value", () => {
    render(
      <Select label="Color" name="color" value="b" onChange={() => {}} options={testOptions} />,
    );
    expect(screen.getByLabelText("Color")).toHaveValue("b");
  });

  it("calls onChange when selection changes", () => {
    const handleChange = vi.fn();
    render(
      <Select label="Color" name="color" value="a" onChange={handleChange} options={testOptions} />,
    );
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "b" } });
    expect(handleChange).toHaveBeenCalledOnce();
  });

  it("renders as disabled when disabled prop is true", () => {
    render(
      <Select
        label="Color"
        name="color"
        value=""
        onChange={() => {}}
        options={testOptions}
        disabled
      />,
    );
    expect(screen.getByLabelText("Color")).toBeDisabled();
  });

  it("displays error message when error prop is provided", () => {
    render(
      <Select
        label="Color"
        name="color"
        value=""
        onChange={() => {}}
        options={testOptions}
        error="Required field"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Required field");
  });

  it("does not display error message when error prop is not provided", () => {
    render(
      <Select label="Color" name="color" value="" onChange={() => {}} options={testOptions} />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

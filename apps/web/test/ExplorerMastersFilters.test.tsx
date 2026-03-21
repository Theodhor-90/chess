import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExplorerMastersFilters } from "../src/components/ExplorerMastersFilters.js";
import type { MastersFilterState } from "../src/components/ExplorerMastersFilters.js";

afterEach(() => {
  cleanup();
});

describe("ExplorerMastersFilters", () => {
  const defaultFilters: MastersFilterState = { since: "", until: "" };

  it("renders Since and Until inputs", () => {
    render(<ExplorerMastersFilters filters={defaultFilters} onChange={vi.fn()} />);

    expect(screen.getByLabelText("Since")).toBeInTheDocument();
    expect(screen.getByLabelText("Until")).toBeInTheDocument();
  });

  it("calls onChange with updated since value", () => {
    const onChange = vi.fn();
    render(<ExplorerMastersFilters filters={defaultFilters} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Since"), { target: { value: "2020" } });
    expect(onChange).toHaveBeenCalledWith({ since: "2020", until: "" });
  });

  it("calls onChange with updated until value", () => {
    const onChange = vi.fn();
    render(<ExplorerMastersFilters filters={defaultFilters} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Until"), { target: { value: "2024" } });
    expect(onChange).toHaveBeenCalledWith({ since: "", until: "2024" });
  });

  it("displays current filter values", () => {
    render(
      <ExplorerMastersFilters filters={{ since: "1990", until: "2023" }} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText("Since")).toHaveValue(1990);
    expect(screen.getByLabelText("Until")).toHaveValue(2023);
  });
});

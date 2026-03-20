import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ExplorerOpeningName } from "../src/components/ExplorerOpeningName.js";

afterEach(() => {
  cleanup();
});

describe("ExplorerOpeningName", () => {
  it("renders ECO code and opening name when opening is provided", () => {
    render(<ExplorerOpeningName opening={{ eco: "B07", name: "Pirc Defense" }} />);

    expect(screen.getByText("B07")).toBeInTheDocument();
    expect(screen.getByText("Pirc Defense")).toBeInTheDocument();
  });

  it("renders unknown position label when opening is null", () => {
    render(<ExplorerOpeningName opening={null} />);

    expect(screen.getByText("Unknown position")).toBeInTheDocument();
  });

  it("does not render ECO badge when opening is null", () => {
    render(<ExplorerOpeningName opening={null} />);

    expect(screen.queryByText(/^[A-E]\d{2}$/)).not.toBeInTheDocument();
  });
});

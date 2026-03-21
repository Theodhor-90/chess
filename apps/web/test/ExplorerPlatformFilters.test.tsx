import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ExplorerPlatformFilters,
  ALL_RATING_BRACKETS,
  ALL_SPEED_CATEGORIES,
} from "../src/components/ExplorerPlatformFilters.js";
import type { PlatformFilterState } from "../src/components/ExplorerPlatformFilters.js";

afterEach(() => {
  cleanup();
});

describe("ExplorerPlatformFilters", () => {
  const defaultFilters: PlatformFilterState = {
    ratings: [...ALL_RATING_BRACKETS],
    speeds: [...ALL_SPEED_CATEGORIES],
    since: "",
    until: "",
  };

  it("renders all rating bracket chips", () => {
    render(<ExplorerPlatformFilters filters={defaultFilters} onChange={vi.fn()} />);

    for (const bracket of ALL_RATING_BRACKETS) {
      expect(screen.getByRole("button", { name: bracket })).toBeInTheDocument();
    }
  });

  it("renders all speed category chips", () => {
    render(<ExplorerPlatformFilters filters={defaultFilters} onChange={vi.fn()} />);

    for (const speed of ALL_SPEED_CATEGORIES) {
      expect(screen.getByRole("button", { name: speed })).toBeInTheDocument();
    }
  });

  it("toggles a rating bracket off when clicked", () => {
    const onChange = vi.fn();
    render(<ExplorerPlatformFilters filters={defaultFilters} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "1400-1600" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        ratings: expect.not.arrayContaining(["1400-1600"]),
      }),
    );
  });

  it("toggles a rating bracket on when clicked and it was deselected", () => {
    const onChange = vi.fn();
    const filtersWithout1400 = {
      ...defaultFilters,
      ratings: defaultFilters.ratings.filter((r) => r !== "1400-1600"),
    };
    render(<ExplorerPlatformFilters filters={filtersWithout1400} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "1400-1600" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        ratings: expect.arrayContaining(["1400-1600"]),
      }),
    );
  });

  it("toggles a speed category off when clicked", () => {
    const onChange = vi.fn();
    render(<ExplorerPlatformFilters filters={defaultFilters} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "blitz" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        speeds: expect.not.arrayContaining(["blitz"]),
      }),
    );
  });

  it("renders active chips with aria-pressed true", () => {
    render(<ExplorerPlatformFilters filters={defaultFilters} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "bullet" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders inactive chips with aria-pressed false", () => {
    const filtersNoBullet = {
      ...defaultFilters,
      speeds: defaultFilters.speeds.filter((s) => s !== "bullet"),
    };
    render(<ExplorerPlatformFilters filters={filtersNoBullet} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "bullet" })).toHaveAttribute("aria-pressed", "false");
  });
});

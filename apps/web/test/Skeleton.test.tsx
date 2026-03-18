import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  Skeleton,
  PageSkeleton,
  TableSkeleton,
  GamePageSkeleton,
} from "../src/components/ui/index.js";

afterEach(() => {
  cleanup();
});

describe("Skeleton", () => {
  it("renders a div with aria-hidden", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("DIV");
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("applies width and height as inline styles", () => {
    const { container } = render(<Skeleton width="200px" height="40px" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe("200px");
    expect(el.style.height).toBe("40px");
  });

  it("accepts numeric width and height", () => {
    const { container } = render(<Skeleton width={100} height={20} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe("100px");
    expect(el.style.height).toBe("20px");
  });

  it("accepts a custom className", () => {
    const { container } = render(<Skeleton className="custom" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.classList.contains("custom")).toBe(true);
  });
});

describe("PageSkeleton", () => {
  it("renders with aria-hidden on the container", () => {
    const { container } = render(<PageSkeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders multiple skeleton children", () => {
    const { container } = render(<PageSkeleton />);
    const el = container.firstElementChild as HTMLElement;
    // header line + 3 text lines = 4 children
    expect(el.children.length).toBe(4);
  });

  it("renders with custom testId", () => {
    render(<PageSkeleton testId="my-skeleton" />);
    expect(screen.getByTestId("my-skeleton")).toBeTruthy();
  });
});

describe("TableSkeleton", () => {
  it("renders the default 5 rows", () => {
    const { container } = render(<TableSkeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.children.length).toBe(5);
  });

  it("renders a custom number of rows", () => {
    const { container } = render(<TableSkeleton rows={3} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.children.length).toBe(3);
  });

  it("renders with custom testId", () => {
    render(<TableSkeleton testId="table-skel" />);
    expect(screen.getByTestId("table-skel")).toBeTruthy();
  });
});

describe("GamePageSkeleton", () => {
  it("renders with aria-hidden on the container", () => {
    const { container } = render(<GamePageSkeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders 3 skeleton children (player bar + board + player bar)", () => {
    const { container } = render(<GamePageSkeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.children.length).toBe(3);
  });

  it("renders with custom testId", () => {
    render(<GamePageSkeleton testId="game-skel" />);
    expect(screen.getByTestId("game-skel")).toBeTruthy();
  });
});

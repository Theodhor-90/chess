import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Pagination } from "../src/components/ui/index.js";

afterEach(() => {
  cleanup();
});

describe("Pagination", () => {
  it("renders page indicator text", () => {
    render(<Pagination currentPage={3} totalPages={10} onPageChange={() => {}} />);
    expect(screen.getByText("Page 3 of 10")).toBeDefined();
  });

  it("renders Previous and Next buttons", () => {
    render(<Pagination currentPage={2} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Next" })).toBeDefined();
  });

  it("disables Previous button on first page", () => {
    render(<Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("disables Next button on last page", () => {
    render(<Pagination currentPage={5} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("enables both buttons on a middle page", () => {
    render(<Pagination currentPage={3} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Previous" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
  });

  it("calls onPageChange with previous page when Previous is clicked", () => {
    const handlePageChange = vi.fn();
    render(<Pagination currentPage={3} totalPages={5} onPageChange={handlePageChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(handlePageChange).toHaveBeenCalledOnce();
    expect(handlePageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with next page when Next is clicked", () => {
    const handlePageChange = vi.fn();
    render(<Pagination currentPage={3} totalPages={5} onPageChange={handlePageChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(handlePageChange).toHaveBeenCalledOnce();
    expect(handlePageChange).toHaveBeenCalledWith(4);
  });

  it("renders a nav element with aria-label", () => {
    render(<Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />);
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeDefined();
  });
});

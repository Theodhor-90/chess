import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Table } from "../src/components/ui/index.js";
import type { TableColumn } from "../src/components/ui/index.js";

interface TestRow {
  id: number;
  name: string;
  score: number;
}

const testColumns: TableColumn<TestRow>[] = [
  { key: "id", header: "ID" },
  { key: "name", header: "Name", sortable: true },
  { key: "score", header: "Score", sortable: true },
];

const testData: TestRow[] = [
  { id: 1, name: "Alice", score: 100 },
  { id: 2, name: "Bob", score: 200 },
  { id: 3, name: "Charlie", score: 150 },
];

afterEach(() => {
  cleanup();
});

describe("Table", () => {
  it("renders column headers", () => {
    render(<Table columns={testColumns} data={testData} />);
    expect(screen.getByText("ID")).toBeDefined();
    expect(screen.getByText("Name")).toBeDefined();
    expect(screen.getByText("Score")).toBeDefined();
  });

  it("renders data rows", () => {
    render(<Table columns={testColumns} data={testData} />);
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Bob")).toBeDefined();
    expect(screen.getByText("Charlie")).toBeDefined();
  });

  it("renders empty message when data is empty", () => {
    render(<Table columns={testColumns} data={[]} />);
    expect(screen.getByText("No data")).toBeDefined();
  });

  it("renders custom empty message", () => {
    render(<Table columns={testColumns} data={[]} emptyMessage="No games found" />);
    expect(screen.getByText("No games found")).toBeDefined();
  });

  it("calls onSort when a sortable header is clicked", () => {
    const handleSort = vi.fn();
    render(<Table columns={testColumns} data={testData} onSort={handleSort} />);
    fireEvent.click(screen.getByText("Name"));
    expect(handleSort).toHaveBeenCalledOnce();
    expect(handleSort).toHaveBeenCalledWith("name");
  });

  it("does not call onSort when a non-sortable header is clicked", () => {
    const handleSort = vi.fn();
    render(<Table columns={testColumns} data={testData} onSort={handleSort} />);
    fireEvent.click(screen.getByText("ID"));
    expect(handleSort).not.toHaveBeenCalled();
  });

  it("displays ascending sort indicator on active column", () => {
    render(<Table columns={testColumns} data={testData} sortColumn="name" sortDirection="asc" />);
    expect(screen.getByText("Name ▲")).toBeDefined();
  });

  it("displays descending sort indicator on active column", () => {
    render(<Table columns={testColumns} data={testData} sortColumn="score" sortDirection="desc" />);
    expect(screen.getByText("Score ▼")).toBeDefined();
  });

  it("calls onRowClick when a data row is clicked", () => {
    const handleRowClick = vi.fn();
    render(<Table columns={testColumns} data={testData} onRowClick={handleRowClick} />);
    fireEvent.click(screen.getByText("Alice"));
    expect(handleRowClick).toHaveBeenCalledOnce();
    expect(handleRowClick).toHaveBeenCalledWith({ id: 1, name: "Alice", score: 100 });
  });

  it("uses custom render function for column cells", () => {
    const columnsWithRender: TableColumn<TestRow>[] = [
      { key: "id", header: "ID" },
      {
        key: "name",
        header: "Name",
        render: (row) => <strong data-testid={`name-${row.id}`}>{row.name.toUpperCase()}</strong>,
      },
    ];
    render(<Table columns={columnsWithRender} data={testData} />);
    expect(screen.getByTestId("name-1")).toHaveTextContent("ALICE");
    expect(screen.getByTestId("name-2")).toHaveTextContent("BOB");
  });
});

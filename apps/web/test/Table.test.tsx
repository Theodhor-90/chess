import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Table } from "../src/components/ui/index.js";
import type { TableColumn } from "../src/components/ui/index.js";

vi.mock("../src/components/ui/Table.module.css", () => ({
  default: {
    wrapper: "wrapper",
    table: "table",
    th: "th",
    sortable: "sortable",
    td: "td",
    truncate: "truncate",
    clickableRow: "clickableRow",
    empty: "empty",
  },
}));

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

  it("applies truncate class to cells when column has truncate: true", () => {
    const columns: TableColumn<{ name: string; age: number }>[] = [
      { key: "name", header: "Name", truncate: true },
      { key: "age", header: "Age" },
    ];
    const data = [{ name: "Alice", age: 30 }];

    render(<Table columns={columns} data={data} />);

    const cells = screen.getAllByRole("cell");
    expect(cells[0].className).toContain("truncate");
    expect(cells[1].className).not.toContain("truncate");
  });

  it("renders th elements with scope='col'", () => {
    render(<Table columns={testColumns} data={testData} />);
    const headers = screen.getAllByRole("columnheader");
    headers.forEach((th) => expect(th).toHaveAttribute("scope", "col"));
  });

  it("sortable headers are keyboard accessible via Enter", () => {
    const handleSort = vi.fn();
    render(<Table columns={testColumns} data={testData} onSort={handleSort} />);
    const nameHeader = screen.getByText("Name");
    fireEvent.keyDown(nameHeader, { key: "Enter" });
    expect(handleSort).toHaveBeenCalledWith("name");
  });

  it("sortable headers are keyboard accessible via Space", () => {
    const handleSort = vi.fn();
    render(<Table columns={testColumns} data={testData} onSort={handleSort} />);
    const nameHeader = screen.getByText("Name");
    fireEvent.keyDown(nameHeader, { key: " " });
    expect(handleSort).toHaveBeenCalledWith("name");
  });

  it("clickable rows are keyboard accessible via Enter", () => {
    const handleRowClick = vi.fn();
    render(<Table columns={testColumns} data={testData} onRowClick={handleRowClick} />);
    const firstRow = screen.getByText("Alice").closest("tr")!;
    fireEvent.keyDown(firstRow, { key: "Enter" });
    expect(handleRowClick).toHaveBeenCalledWith({ id: 1, name: "Alice", score: 100 });
  });

  it("renders aria-sort on sorted column", () => {
    render(
      <Table
        columns={testColumns}
        data={testData}
        sortColumn="name"
        sortDirection="asc"
        onSort={vi.fn()}
      />,
    );
    const nameHeader = screen.getByText("Name ▲");
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
  });
});

import type { ReactNode } from "react";
import styles from "./Table.module.css";

interface TableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (columnKey: string) => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  className?: string;
}

function Table<T>({
  columns,
  data,
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
  emptyMessage = "No data",
  className,
}: TableProps<T>) {
  const wrapperClassNames = [styles.wrapper, className ?? ""].filter(Boolean).join(" ");

  function getSortIndicator(columnKey: string): string {
    if (sortColumn !== columnKey) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  }

  function handleHeaderClick(column: TableColumn<T>): void {
    if (column.sortable && onSort) {
      onSort(column.key);
    }
  }

  function renderCell(row: T, column: TableColumn<T>): ReactNode {
    if (column.render) {
      return column.render(row);
    }
    return (row as Record<string, unknown>)[column.key] as ReactNode;
  }

  return (
    <div className={wrapperClassNames}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={[styles.th, column.sortable ? styles.sortable : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => handleHeaderClick(column)}
              >
                {column.header}
                {getSortIndicator(column.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={index}
                className={onRowClick ? styles.clickableRow : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} className={styles.td}>
                    {renderCell(row, column)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export { Table };
export type { TableColumn, TableProps };

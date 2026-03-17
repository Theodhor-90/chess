import { Button } from "./Button.js";
import styles from "./Pagination.module.css";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

function Pagination({ currentPage, totalPages, onPageChange, className }: PaginationProps) {
  const navClassNames = [styles.pagination, className ?? ""].filter(Boolean).join(" ");

  return (
    <nav className={navClassNames} aria-label="Pagination">
      <Button
        variant="ghost"
        size="sm"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        Previous
      </Button>
      <span className={styles.indicator}>
        Page {currentPage} of {totalPages}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next
      </Button>
    </nav>
  );
}

export { Pagination };
export type { PaginationProps };

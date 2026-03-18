import type { ReactNode } from "react";
import styles from "./Button.module.css";

interface ButtonProps {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  type?: "button" | "submit";
  className?: string;
}

function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  onClick,
  children,
  type = "button",
  className,
}: ButtonProps) {
  const classNames = [
    styles.button,
    styles[variant],
    styles[size],
    loading ? styles.loading : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classNames} disabled={disabled || loading} onClick={onClick}>
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}

export { Button };
export type { ButtonProps };

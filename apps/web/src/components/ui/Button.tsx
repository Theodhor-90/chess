import type { ReactNode, ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
  type?: "button" | "submit";
}

function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  children,
  type = "button",
  className,
  ...rest
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
    <button type={type} className={classNames} disabled={disabled || loading} {...rest}>
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}

export { Button };
export type { ButtonProps };

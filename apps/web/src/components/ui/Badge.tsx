import type { ReactNode } from "react";
import styles from "./Badge.module.css";

interface BadgeProps {
  variant?: "success" | "danger" | "warning" | "neutral" | "info";
  size?: "sm" | "md";
  children: ReactNode;
  className?: string;
}

function Badge({ variant = "neutral", size = "md", children, className }: BadgeProps) {
  const classNames = [styles.badge, styles[variant], styles[size], className ?? ""]
    .filter(Boolean)
    .join(" ");

  return <span className={classNames}>{children}</span>;
}

export { Badge };
export type { BadgeProps };

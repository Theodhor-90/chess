import type { ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps {
  header?: ReactNode;
  padding?: "sm" | "md" | "lg";
  children: ReactNode;
  className?: string;
}

const paddingClasses: Record<string, string> = {
  sm: styles.paddingSm,
  md: styles.paddingMd,
  lg: styles.paddingLg,
};

function Card({ header, padding = "md", children, className }: CardProps) {
  const classNames = [styles.card, className ?? ""].filter(Boolean).join(" ");

  return (
    <div className={classNames}>
      {header !== undefined && <div className={styles.header}>{header}</div>}
      <div className={paddingClasses[padding]}>{children}</div>
    </div>
  );
}

export { Card };
export type { CardProps };

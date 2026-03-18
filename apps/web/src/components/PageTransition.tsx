import { useLocation } from "react-router";
import type { ReactNode } from "react";
import styles from "./PageTransition.module.css";

function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div key={location.pathname} className={styles.transition}>
      {children}
    </div>
  );
}

export { PageTransition };

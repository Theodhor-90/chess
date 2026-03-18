import { Outlet } from "react-router";
import { NavHeader } from "./NavHeader.js";
import { PageTransition } from "./PageTransition.js";
import { useRouteChangeFocus } from "../hooks/useRouteChangeFocus.js";
import styles from "./Layout.module.css";

function Layout() {
  useRouteChangeFocus();

  return (
    <div className={styles.layout}>
      <NavHeader />
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
    </div>
  );
}

export { Layout };

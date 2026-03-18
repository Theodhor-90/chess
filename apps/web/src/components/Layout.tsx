import { Outlet } from "react-router";
import { NavHeader } from "./NavHeader.js";
import styles from "./Layout.module.css";

function Layout() {
  return (
    <div className={styles.layout}>
      <NavHeader />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

export { Layout };

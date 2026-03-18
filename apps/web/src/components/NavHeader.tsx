import { Link, useLocation, useNavigate } from "react-router";
import { useGetMeQuery, useLogoutMutation } from "../store/apiSlice.js";
import { useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";
import { Button } from "./ui/Button.js";
import styles from "./NavHeader.module.css";

const NAV_LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/history", label: "History" },
  { to: "/training", label: "Training" },
  { to: "/database", label: "Database" },
] as const;

export function NavHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { data: meData } = useGetMeQuery();
  const [logout] = useLogoutMutation();

  const isAuthenticated = !!meData?.user;

  async function handleLogout() {
    try {
      await logout().unwrap();
    } catch {
      // Proceed with local cleanup even if server logout fails
    }
    dispatch(socketActions.disconnect());
    navigate("/login");
  }

  function isActive(path: string): boolean {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  }

  return (
    <header data-testid="nav-header" className={styles.header}>
      <Link to="/" className={styles.brand}>
        Chess Platform
      </Link>

      <nav className={styles.nav}>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`${styles.navLink} ${isActive(link.to) ? styles.navLinkActive : ""}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className={styles.userArea}>
        {isAuthenticated ? (
          <>
            <Link
              to={`/profile/${meData.user.id}`}
              data-testid="user-display-name"
              className={styles.userLink}
            >
              {meData.user.username}
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </>
        ) : (
          <Link to="/login" className={styles.navLink}>
            Login
          </Link>
        )}
      </div>
    </header>
  );
}

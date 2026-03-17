import { Link, useNavigate } from "react-router";
import { useGetMeQuery, useLogoutMutation } from "../store/apiSlice.js";
import { useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";
import styles from "./NavHeader.module.css";

export function NavHeader() {
  const navigate = useNavigate();
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

  return (
    <nav data-testid="nav-header" className={styles.nav}>
      <div className={styles.leftGroup}>
        <Link to="/" className={styles.titleLink}>
          Chess Platform
        </Link>
        <Link to="/database" data-testid="nav-database" className={styles.navLink}>
          Database
        </Link>
      </div>
      <div>
        {isAuthenticated ? (
          <>
            <Link
              to={`/profile/${meData.user.id}`}
              data-testid="user-display-name"
              className={styles.userLink}
            >
              {meData.user.username}
            </Link>{" "}
            <button data-testid="logout-button" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <Link to="/login">Login</Link>
        )}
      </div>
    </nav>
  );
}

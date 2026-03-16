import { Link, useNavigate } from "react-router";
import { useGetMeQuery, useLogoutMutation } from "../store/apiSlice.js";
import { useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";

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
    <nav
      data-testid="nav-header"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 16px",
        borderBottom: "1px solid #ccc",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <Link to="/" style={{ textDecoration: "none", color: "inherit", fontWeight: "bold" }}>
          Chess Platform
        </Link>
        <Link
          to="/database"
          data-testid="nav-database"
          style={{ textDecoration: "none", color: "#1a73e8", fontSize: "14px" }}
        >
          Database
        </Link>
      </div>
      <div>
        {isAuthenticated ? (
          <>
            <Link
              to={`/profile/${meData.user.id}`}
              data-testid="user-display-name"
              style={{ textDecoration: "none", color: "inherit" }}
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

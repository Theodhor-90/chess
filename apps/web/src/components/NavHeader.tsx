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
      <Link to="/" style={{ textDecoration: "none", color: "inherit", fontWeight: "bold" }}>
        Chess Platform
      </Link>
      <div>
        {isAuthenticated ? (
          <>
            <span data-testid="user-email">{meData.user.email}</span>{" "}
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

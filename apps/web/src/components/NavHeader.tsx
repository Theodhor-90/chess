import { useState, useEffect, useRef, useCallback } from "react";
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
  { to: "/puzzles", label: "Puzzles" },
  { to: "/repertoires", label: "Repertoires" },
  { to: "/database", label: "Database" },
] as const;

const MOBILE_MENU_ID = "mobile-nav-menu";

export function NavHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { data: meData } = useGetMeQuery();
  const [logout] = useLogoutMutation();

  const isAuthenticated = !!meData?.user;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Escape key and outside-click listeners
  useEffect(() => {
    if (!menuOpen) return;

    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        hamburgerRef.current?.focus();
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        hamburgerRef.current &&
        !hamburgerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  // Focus first link when menu opens
  useEffect(() => {
    if (menuOpen && menuRef.current) {
      const firstLink = menuRef.current.querySelector<HTMLElement>("a[href]");
      if (firstLink) {
        firstLink.focus();
      }
    }
  }, [menuOpen]);

  const toggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

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

      {/* Desktop nav — hidden on mobile via CSS */}
      <nav className={styles.nav}>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`${styles.navLink} ${isActive(link.to) ? styles.navLinkActive : ""}`}
            aria-current={isActive(link.to) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Desktop user area — hidden on mobile via CSS */}
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
            <Link to="/settings" className={styles.settingsLink} data-testid="settings-link">
              Settings
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

      {/* Hamburger button — visible on mobile only via CSS */}
      <button
        ref={hamburgerRef}
        type="button"
        className={`${styles.hamburger} ${menuOpen ? styles.hamburgerOpen : ""}`}
        aria-expanded={menuOpen}
        aria-controls={MOBILE_MENU_ID}
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        onClick={toggleMenu}
        data-testid="hamburger-button"
      >
        <span className={styles.hamburgerIcon} aria-hidden="true">
          <span className={styles.hamburgerLine} />
          <span className={styles.hamburgerLine} />
          <span className={styles.hamburgerLine} />
        </span>
      </button>

      {/* Mobile menu backdrop — always in DOM, visibility toggled via CSS class */}
      <div
        className={`${styles.menuBackdrop} ${menuOpen ? styles.menuBackdropVisible : ""}`}
        aria-hidden="true"
      />

      {/* Mobile menu panel — always in DOM, visibility toggled via CSS class */}
      <nav
        ref={menuRef}
        id={MOBILE_MENU_ID}
        className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ""}`}
        aria-label="Mobile navigation"
        data-testid="mobile-menu"
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`${styles.mobileMenuLink} ${isActive(link.to) ? styles.mobileMenuLinkActive : ""}`}
            aria-current={isActive(link.to) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
        <div className={styles.mobileMenuDivider} />
        <div className={styles.mobileMenuUserSection}>
          {isAuthenticated ? (
            <>
              <Link
                to={`/profile/${meData.user.id}`}
                className={styles.mobileMenuLink}
                data-testid="mobile-user-link"
              >
                {meData.user.username}
              </Link>
              <Link
                to="/settings"
                className={styles.mobileMenuLink}
                data-testid="mobile-settings-link"
              >
                Settings
              </Link>
              <button
                type="button"
                className={styles.mobileMenuLink}
                onClick={handleLogout}
                style={{ background: "none", border: "none", textAlign: "left", cursor: "pointer" }}
              >
                Logout
              </button>
            </>
          ) : (
            <Link to="/login" className={styles.mobileMenuLink}>
              Login
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}

import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useRegisterMutation } from "../store/apiSlice.js";
import { useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";
import { Card } from "../components/ui/Card.js";
import { Input } from "../components/ui/Input.js";
import { Button } from "../components/ui/Button.js";
import styles from "./RegisterPage.module.css";

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [register, { isLoading, error }] = useRegisterMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await register({ username, email, password }).unwrap();
      dispatch(socketActions.connect());
      const redirect = searchParams.get("redirect");
      navigate(redirect || "/");
    } catch {
      // Error is captured in the `error` field from useRegisterMutation
    }
  }

  const errorMessage =
    error && "data" in error
      ? (error.data as { error: string }).error
      : error
        ? "Registration failed"
        : "";

  return (
    <div className={styles.page}>
      <Card padding="lg" className={styles.card}>
        <h1 className={styles.title}>Register</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <Input
            label="Username"
            name="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={20}
            pattern="^[a-zA-Z0-9_]+$"
            title="3–20 characters, letters, numbers, and underscores only"
          />
          <Input
            label="Email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {errorMessage && (
            <p role="alert" className={styles.error}>
              {errorMessage}
            </p>
          )}
          <Button type="submit" loading={isLoading}>
            {isLoading ? "Registering…" : "Register"}
          </Button>
        </form>
        <p className={styles.footer}>
          Already have an account?{" "}
          <Link
            to={
              searchParams.get("redirect")
                ? `/login?redirect=${searchParams.get("redirect")}`
                : "/login"
            }
            className={styles.footerLink}
          >
            Login
          </Link>
        </p>
      </Card>
    </div>
  );
}

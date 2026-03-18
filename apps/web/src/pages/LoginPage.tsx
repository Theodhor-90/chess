import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useLoginMutation } from "../store/apiSlice.js";
import { useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";
import { Card } from "../components/ui/Card.js";
import { Input } from "../components/ui/Input.js";
import { Button } from "../components/ui/Button.js";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [login, { isLoading, error }] = useLoginMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login({ email, password }).unwrap();
      dispatch(socketActions.connect());
      const redirect = searchParams.get("redirect");
      navigate(redirect || "/");
    } catch {
      // Error is captured in the `error` field from useLoginMutation
    }
  }

  const errorMessage =
    error && "data" in error
      ? (error.data as { error: string }).error
      : error
        ? "Login failed"
        : "";

  return (
    <div className={styles.page}>
      <Card padding="lg" className={styles.card}>
        <h1 className={styles.title}>Login</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
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
            {isLoading ? "Logging in…" : "Login"}
          </Button>
        </form>
        <p className={styles.footer}>
          Don&apos;t have an account?{" "}
          <Link
            to={
              searchParams.get("redirect")
                ? `/register?redirect=${searchParams.get("redirect")}`
                : "/register"
            }
            className={styles.footerLink}
          >
            Register
          </Link>
        </p>
      </Card>
    </div>
  );
}

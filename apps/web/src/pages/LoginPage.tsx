import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useLoginMutation } from "../store/apiSlice.js";
import { useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";

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
    <div>
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {errorMessage && <p role="alert">{errorMessage}</p>}
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Logging in…" : "Login"}
        </button>
      </form>
      <p>
        Don&apos;t have an account?{" "}
        <Link
          to={
            searchParams.get("redirect")
              ? `/register?redirect=${searchParams.get("redirect")}`
              : "/register"
          }
        >
          Register
        </Link>
      </p>
    </div>
  );
}

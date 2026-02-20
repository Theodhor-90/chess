import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useRegisterMutation } from "../store/apiSlice.js";
import { useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [register, { isLoading, error }] = useRegisterMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await register({ email, password }).unwrap();
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
    <div>
      <h1>Register</h1>
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
          {isLoading ? "Registering…" : "Register"}
        </button>
      </form>
      <p>
        Already have an account?{" "}
        <Link
          to={
            searchParams.get("redirect")
              ? `/login?redirect=${searchParams.get("redirect")}`
              : "/login"
          }
        >
          Login
        </Link>
      </p>
    </div>
  );
}

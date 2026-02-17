import type { AuthResponse, ErrorResponse } from "@chess/shared";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json()) as ErrorResponse;
    throw new Error(body.error);
  }

  return res.json() as Promise<T>;
}

export function register(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json()) as ErrorResponse;
    throw new Error(body.error);
  }
}

export function getMe(): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/me");
}

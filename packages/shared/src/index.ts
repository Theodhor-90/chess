export interface HealthResponse {
  status: "ok";
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: number;
    email: string;
  };
}

export interface ErrorResponse {
  error: string;
}

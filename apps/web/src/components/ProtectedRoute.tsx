import { Navigate, useLocation } from "react-router";
import { useGetMeQuery } from "../store/apiSlice.js";
import { PageSkeleton } from "./ui/Skeleton.js";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useGetMeQuery();
  const location = useLocation();

  if (isLoading) {
    return <PageSkeleton testId="auth-loading" />;
  }

  if (isError || !data) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
}

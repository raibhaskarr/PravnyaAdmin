import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../api/types";

export function ProtectedRoute({ allow }: { allow?: UserRole[] }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(user.role)) {
    return <Navigate to={user.role === "SUPERADMIN" ? "/admin/tenants" : "/tenant/kids"} replace />;
  }
  return <Outlet />;
}

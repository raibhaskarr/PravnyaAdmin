import { useAuth } from "../context/AuthContext";
import { Layout } from "./Layout";
import { AdminLayout } from "./AdminLayout";

/** Picks which shell wraps a page shared across every role -- currently just /manual. A superadmin
 * should see it inside the new AdminLayout (sidebar, breadcrumb), same as the rest of their
 * section, while every other role keeps the existing Layout. One route registration in main.tsx
 * (not two duplicated ones for the same path) stays the source of truth for /manual itself. */
export function RoleAwareLayout() {
  const { user } = useAuth();
  if (user?.role === "SUPERADMIN") return <AdminLayout />;
  return <Layout />;
}

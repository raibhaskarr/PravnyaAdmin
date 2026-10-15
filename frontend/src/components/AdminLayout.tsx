import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu } from "primereact/menu";
import type { MenuItem } from "primereact/menuitem";
import { Button } from "primereact/button";
import { Avatar } from "primereact/avatar";
import { BreadCrumb } from "primereact/breadcrumb";
import { useAuth } from "../context/AuthContext";
import "../adminLayout.css";

// /manual is a shared, cross-role page -- RoleAwareLayout (see main.tsx) picks this layout for it
// specifically when the current user is a superadmin, so it's safe to link to here without a
// jarring layout swap on click, even though the route itself isn't nested under the
// superadmin-only route block the rest of this nav lives in.
const NAV_ITEMS = [
  { to: "/admin/tenants", label: "Tenants", icon: "pi pi-building" },
  { to: "/admin/taxonomy", label: "Taxonomy", icon: "pi pi-sitemap" },
  { to: "/admin/poc-review", label: "AI Tagging POC", icon: "pi pi-chart-line" },
  { to: "/admin/superadmins", label: "Superadmins", icon: "pi pi-shield" },
  { to: "/manual", label: "Manual", icon: "pi pi-book" }
];

/** Pilot of PrimeReact for the superadmin section only -- see docs/manual/03-business-logic.md
 * for why this is scoped here rather than replacing Layout.tsx everywhere at once. Tenant-scoped
 * pages keep using the existing hand-rolled Layout/CSS unchanged. */
export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  if (!user) return null;

  const activeItem = NAV_ITEMS.find((item) => location.pathname.startsWith(item.to));

  const menuItems: MenuItem[] = NAV_ITEMS.map((item) => ({
    label: item.label,
    icon: item.icon,
    className: item === activeItem ? "admin-nav-active" : undefined,
    command: () => navigate(item.to)
  }));

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <button
          type="button"
          className="admin-sidebar-brand"
          onClick={() => navigate("/admin/account")}
          title="Account settings"
          style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
        >
          <Avatar label={user.name.charAt(0).toUpperCase()} shape="circle" style={{ backgroundColor: "#6366f1", color: "#ffffff" }} />
          <div>
            <p className="admin-sidebar-name">{user.name}</p>
            <p className="admin-sidebar-role">Superadmin</p>
          </div>
        </button>
        <Menu model={menuItems} className="admin-nav" />
        <Button label="Log out" icon="pi pi-sign-out" onClick={logout} className="admin-logout p-button-text" />
      </aside>
      <main className="admin-content">
        {activeItem ? (
          <BreadCrumb
            model={[{ label: activeItem.label }]}
            home={{ icon: "pi pi-home", command: () => navigate("/admin/tenants") }}
            className="admin-breadcrumb"
          />
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}

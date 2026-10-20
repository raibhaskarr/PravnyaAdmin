import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu } from "primereact/menu";
import type { MenuItem } from "primereact/menuitem";
import { Button } from "primereact/button";
import { Avatar } from "primereact/avatar";
import { BreadCrumb } from "primereact/breadcrumb";
import { useAuth } from "../context/AuthContext";
import type { AuthUser } from "../api/types";
import "../adminLayout.css";

type NavItem = { to: string; label: string; icon: string };

const ROLE_LABEL: Record<AuthUser["role"], string> = {
  SUPERADMIN: "Superadmin",
  TENANT_ADMIN: "Tenant Admin",
  THERAPIST: "Therapist",
  VIEWER: "Viewer"
};

// Single shared sidebar for every role -- nav items and the account-settings target both depend
// on who's logged in, everything else (shell, breadcrumb, logout) is identical.
function navItemsForRole(role: AuthUser["role"]): NavItem[] {
  if (role === "SUPERADMIN") {
    return [
      { to: "/admin/tenants", label: "Tenants", icon: "pi pi-building" },
      { to: "/admin/taxonomy", label: "Taxonomy", icon: "pi pi-sitemap" },
      { to: "/admin/poc-review", label: "AI Tagging POC", icon: "pi pi-chart-line" },
      { to: "/admin/superadmins", label: "Superadmins", icon: "pi pi-shield" },
      { to: "/manual", label: "Manual", icon: "pi pi-book" }
    ];
  }
  // Therapists and Parents are staff/roster-management pages -- a Therapist can't add another
  // therapist or manage households, so there's nothing for them to do there (see the matching
  // route restriction in main.tsx). Viewer keeps both: read-only oversight is exactly what that
  // role exists for.
  return [
    ...(role !== "VIEWER" ? [{ to: "/tenant/log", label: "Log a session", icon: "pi pi-pencil" }] : []),
    { to: "/tenant/disciplines", label: "Disciplines", icon: "pi pi-sitemap" },
    ...(role !== "THERAPIST" ? [{ to: "/tenant/therapists", label: "Therapists", icon: "pi pi-users" }] : []),
    ...(role !== "THERAPIST" ? [{ to: "/tenant/parents", label: "Parents", icon: "pi pi-home" }] : []),
    { to: "/tenant/kids", label: "Kids", icon: "pi pi-id-card" },
    ...(role === "TENANT_ADMIN" ? [{ to: "/tenant/profile", label: "Business Profile", icon: "pi pi-briefcase" }] : []),
    // A Therapist's "Account" page is mostly their own professional profile (DOB, bio, qualified
    // disciplines), not just password settings -- unlike other roles, that's worth a real nav
    // entry rather than relying on the small avatar-click-only "Account settings" affordance every
    // role otherwise shares.
    ...(role === "THERAPIST" ? [{ to: "/tenant/account", label: "My Profile", icon: "pi pi-user" }] : [])
  ];
}

function accountPathForRole(role: AuthUser["role"]): string {
  return role === "SUPERADMIN" ? "/admin/account" : "/tenant/account";
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  if (!user) return null;

  const navItems = navItemsForRole(user.role);
  const activeItem = navItems.find((item) => location.pathname.startsWith(item.to));

  const menuItems: MenuItem[] = navItems.map((item) => ({
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
          onClick={() => navigate(accountPathForRole(user.role))}
          title="Account settings"
          style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
        >
          <Avatar label={user.name.charAt(0).toUpperCase()} shape="circle" style={{ backgroundColor: "#6366f1", color: "#ffffff" }} />
          <div>
            <p className="admin-sidebar-name">{user.name}</p>
            <p className="admin-sidebar-role">{ROLE_LABEL[user.role]}</p>
          </div>
        </button>
        <Menu model={menuItems} className="admin-nav" />
        <Button label="Log out" icon="pi pi-sign-out" onClick={logout} className="admin-logout p-button-text" />
      </aside>
      <main className="admin-content">
        {activeItem ? (
          <BreadCrumb
            model={[{ label: activeItem.label }]}
            home={{ icon: "pi pi-home", command: () => navigate(navItems[0].to) }}
            className="admin-breadcrumb"
          />
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}

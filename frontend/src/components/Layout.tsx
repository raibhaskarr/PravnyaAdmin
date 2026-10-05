import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const links =
    user.role === "SUPERADMIN"
      ? [
          { to: "/admin/tenants", label: "Tenants" },
          { to: "/admin/taxonomy", label: "Taxonomy" },
          { to: "/admin/poc-review", label: "AI Tagging POC" }
        ]
      : [
          { to: "/tenant/disciplines", label: "Disciplines" },
          { to: "/tenant/therapists", label: "Therapists" },
          { to: "/tenant/kids", label: "Kids" },
          { to: "/tenant/goals", label: "Goals" },
          { to: "/tenant/growth", label: "Growth" }
        ];
  links.push({ to: "/manual", label: "Manual" });

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <p className="sidebar-brand">Pravnya Admin</p>
        <p className="sidebar-user">
          {user.name} &middot; {user.role.replace("_", " ")}
        </p>
        <ul className="sidebar-nav">
          {links.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} className={({ isActive }) => (isActive ? "active" : "")}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <button type="button" onClick={logout} className="btn btn-secondary">
          Log out
        </button>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

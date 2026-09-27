import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const links =
    user.role === "SUPERADMIN"
      ? [
          { to: "/admin/tenants", label: "Tenants" },
          { to: "/admin/taxonomy", label: "Taxonomy" }
        ]
      : [
          { to: "/tenant/disciplines", label: "Disciplines" },
          { to: "/tenant/therapists", label: "Therapists" },
          { to: "/tenant/kids", label: "Kids" },
          { to: "/tenant/goals", label: "Goals" }
        ];

  return (
    <div style={{ fontFamily: "sans-serif", minHeight: "100vh", display: "flex" }}>
      <nav style={{ width: 200, borderRight: "1px solid #ddd", padding: "1rem", flexShrink: 0 }}>
        <p style={{ fontWeight: "bold" }}>Pravnya Admin</p>
        <p style={{ fontSize: "0.85rem", color: "#666" }}>
          {user.name} ({user.role})
        </p>
        <ul style={{ listStyle: "none", padding: 0, marginTop: "1.5rem" }}>
          {links.map((link) => (
            <li key={link.to} style={{ marginBottom: "0.5rem" }}>
              <NavLink to={link.to} style={({ isActive }) => ({ fontWeight: isActive ? "bold" : "normal" })}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <button type="button" onClick={logout} style={{ marginTop: "2rem" }}>
          Log out
        </button>
      </nav>
      <main style={{ flex: 1, padding: "1.5rem" }}>
        <Outlet />
      </main>
    </div>
  );
}

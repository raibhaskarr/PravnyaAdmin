import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { TenantsPage } from "./pages/admin/TenantsPage";
import { TaxonomyPage } from "./pages/admin/TaxonomyPage";
import { DisciplinesPage } from "./pages/tenant/DisciplinesPage";
import { TherapistsPage } from "./pages/tenant/TherapistsPage";
import { KidsPage } from "./pages/tenant/KidsPage";
import { GoalsPage } from "./pages/tenant/GoalsPage";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute allow={["SUPERADMIN"]} />}>
            <Route element={<Layout />}>
              <Route path="/admin/tenants" element={<TenantsPage />} />
              <Route path="/admin/taxonomy" element={<TaxonomyPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allow={["TENANT_ADMIN", "THERAPIST", "VIEWER"]} />}>
            <Route element={<Layout />}>
              <Route path="/tenant/disciplines" element={<DisciplinesPage />} />
              <Route path="/tenant/therapists" element={<TherapistsPage />} />
              <Route path="/tenant/kids" element={<KidsPage />} />
              <Route path="/tenant/goals" element={<GoalsPage />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

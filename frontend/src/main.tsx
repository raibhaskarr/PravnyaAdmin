import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { TenantsPage } from "./pages/admin/TenantsPage";
import { TaxonomyPage } from "./pages/admin/TaxonomyPage";
import { PocReviewPage } from "./pages/admin/PocReviewPage";
import { DisciplinesPage } from "./pages/tenant/DisciplinesPage";
import { TherapistsPage } from "./pages/tenant/TherapistsPage";
import { KidsPage } from "./pages/tenant/KidsPage";
import { KidDetailPage } from "./pages/tenant/KidDetailPage";
import { LogSessionPage } from "./pages/tenant/LogSessionPage";
import { ManualPage } from "./pages/ManualPage";
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
              <Route path="/admin/poc-review" element={<PocReviewPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allow={["TENANT_ADMIN", "THERAPIST", "VIEWER"]} />}>
            <Route element={<Layout />}>
              <Route path="/tenant/disciplines" element={<DisciplinesPage />} />
              <Route path="/tenant/therapists" element={<TherapistsPage />} />
              <Route path="/tenant/log" element={<LogSessionPage />} />
              <Route path="/tenant/kids" element={<KidsPage />} />
              <Route path="/tenant/kids/:kidId" element={<KidDetailPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/manual" element={<ManualPage />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

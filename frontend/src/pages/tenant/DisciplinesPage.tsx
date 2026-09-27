import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { TenantDiscipline } from "../../api/types";

export function DisciplinesPage() {
  const { token, user } = useAuth();
  const [disciplines, setDisciplines] = useState<TenantDiscipline[]>([]);
  const [error, setError] = useState("");
  const canEdit = user?.role === "TENANT_ADMIN";

  function load() {
    api.listTenantDisciplines(token!).then(setDisciplines);
  }

  useEffect(load, [token]);

  async function toggle(d: TenantDiscipline) {
    setError("");
    try {
      if (d.enabled) await api.disableDiscipline(token!, d.id);
      else await api.enableDiscipline(token!, d.id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update");
    }
  }

  return (
    <div>
      <h1>Disciplines offered</h1>
      <div className="card" style={{ maxWidth: 420 }}>
        {disciplines.map((d) => (
          <label key={d.id} className="checkbox-row">
            <input type="checkbox" checked={d.enabled} disabled={!canEdit} onChange={() => toggle(d)} />
            {d.name}
          </label>
        ))}
      </div>
      {!canEdit ? <p className="hint-text" style={{ marginTop: "0.75rem" }}>Only a Tenant Admin can change offered disciplines.</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

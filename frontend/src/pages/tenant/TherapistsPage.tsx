import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { TenantDiscipline, Therapist } from "../../api/types";

export function TherapistsPage() {
  const { token, user } = useAuth();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [disciplines, setDisciplines] = useState<TenantDiscipline[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [createdCreds, setCreatedCreds] = useState<{ email: string; tempPassword: string } | null>(null);
  const canEdit = user?.role === "TENANT_ADMIN";

  function load() {
    api.listTherapists(token!).then(setTherapists);
    api.listTenantDisciplines(token!).then(setDisciplines);
  }

  useEffect(load, [token]);

  const disciplineName = (id: string) => disciplines.find((d) => d.id === id)?.name ?? id;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const disciplineIds = disciplines.filter((d) => form.get(`discipline_${d.id}`) === "on").map((d) => d.id);
    try {
      const result = await api.createTherapist(token!, {
        email: String(form.get("email")),
        name: String(form.get("name")),
        disciplineIds
      });
      setCreatedCreds({ email: result.therapist.user.email, tempPassword: result.tempPassword });
      setShowForm(false);
      event.currentTarget.reset();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create therapist");
    }
  }

  return (
    <div>
      <h1>Therapists</h1>

      {createdCreds ? (
        <div className="callout">
          <p>
            Therapist account created: <strong>{createdCreds.email}</strong>
          </p>
          <p>
            Temporary password (shown once): <code>{createdCreds.tempPassword}</code>
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => setCreatedCreds(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {canEdit ? (
        <>
          <div className="page-toolbar">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "New therapist"}
            </button>
          </div>
          {showForm ? (
            <form onSubmit={handleCreate} className="form-panel">
              <label className="field">
                <span className="field-label">Name</span>
                <input className="input" name="name" required />
              </label>
              <label className="field">
                <span className="field-label">Email</span>
                <input className="input" name="email" type="email" required />
              </label>
              <fieldset className="form-group">
                <legend>Disciplines practiced</legend>
                {disciplines
                  .filter((d) => d.enabled)
                  .map((d) => (
                    <label key={d.id} className="checkbox-row">
                      <input type="checkbox" name={`discipline_${d.id}`} /> {d.name}
                    </label>
                  ))}
              </fieldset>
              <button type="submit" className="btn btn-primary">
                Create therapist
              </button>
            </form>
          ) : null}
        </>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Disciplines</th>
            </tr>
          </thead>
          <tbody>
            {therapists.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.user.email}</td>
                <td>{t.disciplineIds.map(disciplineName).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {therapists.length === 0 ? <p className="empty-state">No therapists yet.</p> : null}
      </div>
    </div>
  );
}

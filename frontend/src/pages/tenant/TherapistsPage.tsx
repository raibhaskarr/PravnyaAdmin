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
        <div style={{ background: "#eef", padding: "1rem", marginBottom: "1rem" }}>
          <p>
            Therapist account created: <strong>{createdCreds.email}</strong>
          </p>
          <p>
            Temporary password (shown once): <code>{createdCreds.tempPassword}</code>
          </p>
          <button type="button" onClick={() => setCreatedCreds(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {canEdit ? (
        <>
          <button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "New therapist"}
          </button>
          {showForm ? (
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 360, marginTop: "1rem" }}>
              <label>
                Name
                <input name="name" required style={{ display: "block", width: "100%" }} />
              </label>
              <label>
                Email
                <input name="email" type="email" required style={{ display: "block", width: "100%" }} />
              </label>
              <fieldset>
                <legend>Disciplines practiced</legend>
                {disciplines
                  .filter((d) => d.enabled)
                  .map((d) => (
                    <label key={d.id} style={{ display: "block" }}>
                      <input type="checkbox" name={`discipline_${d.id}`} /> {d.name}
                    </label>
                  ))}
              </fieldset>
              <button type="submit">Create therapist</button>
            </form>
          ) : null}
        </>
      ) : null}

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      <table style={{ marginTop: "1.5rem", borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={cellStyle}>Name</th>
            <th style={cellStyle}>Email</th>
            <th style={cellStyle}>Disciplines</th>
          </tr>
        </thead>
        <tbody>
          {therapists.map((t) => (
            <tr key={t.id}>
              <td style={cellStyle}>{t.name}</td>
              <td style={cellStyle}>{t.user.email}</td>
              <td style={cellStyle}>{t.disciplineIds.map(disciplineName).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cellStyle = { border: "1px solid #ddd", padding: "0.5rem", textAlign: "left" as const };

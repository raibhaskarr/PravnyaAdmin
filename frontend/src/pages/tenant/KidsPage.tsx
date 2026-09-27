import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid, Therapist } from "../../api/types";

export function KidsPage() {
  const { token, user } = useAuth();
  const [kids, setKids] = useState<Kid[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const canEdit = user?.role === "TENANT_ADMIN";

  function load() {
    api.listKids(token!).then(setKids);
    api.listTherapists(token!).then(setTherapists);
  }

  useEffect(load, [token]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const therapistIds = therapists.filter((t) => form.get(`therapist_${t.id}`) === "on").map((t) => t.id);
    try {
      await api.createKid(token!, {
        firstName: String(form.get("firstName")),
        lastName: String(form.get("lastName")),
        therapistIds
      });
      setShowForm(false);
      event.currentTarget.reset();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create kid");
    }
  }

  return (
    <div>
      <h1>Kids</h1>

      {canEdit ? (
        <>
          <button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "New kid"}
          </button>
          {showForm ? (
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 360, marginTop: "1rem" }}>
              <label>
                First name
                <input name="firstName" required style={{ display: "block", width: "100%" }} />
              </label>
              <label>
                Last name
                <input name="lastName" required style={{ display: "block", width: "100%" }} />
              </label>
              <fieldset>
                <legend>Assigned therapists</legend>
                {therapists.map((t) => (
                  <label key={t.id} style={{ display: "block" }}>
                    <input type="checkbox" name={`therapist_${t.id}`} /> {t.name}
                  </label>
                ))}
              </fieldset>
              <button type="submit">Create kid</button>
            </form>
          ) : null}
        </>
      ) : null}

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      <table style={{ marginTop: "1.5rem", borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={cellStyle}>Name</th>
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}>Therapists</th>
          </tr>
        </thead>
        <tbody>
          {kids.map((k) => (
            <tr key={k.id}>
              <td style={cellStyle}>
                {k.firstName} {k.lastName}
              </td>
              <td style={cellStyle}>{k.status}</td>
              <td style={cellStyle}>{k.therapists.map((t) => t.therapist.name).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {kids.length === 0 ? <p style={{ color: "#888" }}>No kids visible to your account yet.</p> : null}
    </div>
  );
}

const cellStyle = { border: "1px solid #ddd", padding: "0.5rem", textAlign: "left" as const };

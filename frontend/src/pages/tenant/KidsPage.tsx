import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid, Therapist } from "../../api/types";

export function KidsPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
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
    const formEl = event.currentTarget;
    setError("");
    const form = new FormData(formEl);
    const therapistIds = therapists.filter((t) => form.get(`therapist_${t.id}`) === "on").map((t) => t.id);
    try {
      await api.createKid(token!, {
        firstName: String(form.get("firstName")),
        lastName: String(form.get("lastName")),
        therapistIds
      });
      setShowForm(false);
      formEl.reset();
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
          <div className="page-toolbar">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "New kid"}
            </button>
          </div>
          {showForm ? (
            <form onSubmit={handleCreate} className="form-panel">
              <label className="field">
                <span className="field-label">First name</span>
                <input className="input" name="firstName" required />
              </label>
              <label className="field">
                <span className="field-label">Last name</span>
                <input className="input" name="lastName" required />
              </label>
              <fieldset className="form-group">
                <legend>Assigned therapists</legend>
                {therapists.map((t) => (
                  <label key={t.id} className="checkbox-row">
                    <input type="checkbox" name={`therapist_${t.id}`} /> {t.name}
                  </label>
                ))}
              </fieldset>
              <button type="submit" className="btn btn-primary">
                Create kid
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
              <th>Status</th>
              <th>Therapists</th>
            </tr>
          </thead>
          <tbody>
            {kids.map((k) => (
              <tr key={k.id} onClick={() => navigate(`/tenant/kids/${k.id}`)} style={{ cursor: "pointer" }}>
                <td>
                  {k.firstName} {k.lastName}
                </td>
                <td>{k.status}</td>
                <td>{k.therapists.map((t) => t.therapist.name).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {kids.length === 0 ? <p className="empty-state">No kids visible to your account yet.</p> : null}
      </div>
    </div>
  );
}

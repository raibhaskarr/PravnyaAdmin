import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { CanonicalDomain, CanonicalSkill, Goal, Kid, Modality, TenantDiscipline } from "../../api/types";

const MODALITIES: Modality[] = ["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL"];

export function GoalsPage() {
  const { token, user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [kids, setKids] = useState<Kid[]>([]);
  const [domains, setDomains] = useState<CanonicalDomain[]>([]);
  const [disciplines, setDisciplines] = useState<TenantDiscipline[]>([]);
  const [skills, setSkills] = useState<CanonicalSkill[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const canEdit = user?.role !== "VIEWER";

  function load() {
    api.listGoals(token!).then(setGoals);
    api.listKids(token!).then(setKids);
    api.listDomains(token!).then(setDomains);
    api.listTenantDisciplines(token!).then(setDisciplines);
  }

  useEffect(load, [token]);

  useEffect(() => {
    if (!selectedDomainId) {
      setSkills([]);
      return;
    }
    api.listSkills(token!, selectedDomainId).then(setSkills);
  }, [token, selectedDomainId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api.createGoal(token!, {
        kidId: String(form.get("kidId")),
        canonicalSkillId: String(form.get("canonicalSkillId")),
        disciplineId: String(form.get("disciplineId")),
        modality: form.get("modality") as Modality,
        title: String(form.get("title"))
      });
      setShowForm(false);
      event.currentTarget.reset();
      setSelectedDomainId("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create goal");
    }
  }

  return (
    <div>
      <h1>Goals</h1>

      {canEdit ? (
        <>
          <div className="page-toolbar">
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "New goal"}
            </button>
          </div>
          {showForm ? (
            <form onSubmit={handleCreate} className="form-panel" style={{ maxWidth: 460 }}>
              <label className="field">
                <span className="field-label">Kid</span>
                <select name="kidId" required className="input">
                  <option value="">Select a kid</option>
                  {kids.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.firstName} {k.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Domain</span>
                <select value={selectedDomainId} onChange={(e) => setSelectedDomainId(e.target.value)} className="input">
                  <option value="">Select a domain</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Canonical skill</span>
                <select name="canonicalSkillId" required disabled={!skills.length} className="input">
                  <option value="">Select a skill</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Discipline</span>
                <select name="disciplineId" required className="input">
                  <option value="">Select a discipline</option>
                  {disciplines
                    .filter((d) => d.enabled)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Modality</span>
                <select name="modality" required className="input">
                  {MODALITIES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Goal title (as written)</span>
                <input name="title" required className="input" />
              </label>
              <button type="submit" className="btn btn-primary">
                Create goal
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
              <th>Kid</th>
              <th>Title</th>
              <th>Canonical skill</th>
              <th>Discipline</th>
              <th>Modality</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((g) => (
              <tr key={g.id}>
                <td>
                  {g.kid.firstName} {g.kid.lastName}
                </td>
                <td>{g.title}</td>
                <td>{g.canonicalSkill.name}</td>
                <td>{g.discipline.name}</td>
                <td>{g.modality}</td>
                <td>{g.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {goals.length === 0 ? <p className="empty-state">No goals visible to your account yet.</p> : null}
      </div>
    </div>
  );
}

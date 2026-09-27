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
          <button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "New goal"}
          </button>
          {showForm ? (
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 420, marginTop: "1rem" }}>
              <label>
                Kid
                <select name="kidId" required style={{ display: "block", width: "100%" }}>
                  <option value="">Select a kid</option>
                  {kids.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.firstName} {k.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Domain
                <select value={selectedDomainId} onChange={(e) => setSelectedDomainId(e.target.value)} style={{ display: "block", width: "100%" }}>
                  <option value="">Select a domain</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Canonical skill
                <select name="canonicalSkillId" required disabled={!skills.length} style={{ display: "block", width: "100%" }}>
                  <option value="">Select a skill</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Discipline
                <select name="disciplineId" required style={{ display: "block", width: "100%" }}>
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
              <label>
                Modality
                <select name="modality" required style={{ display: "block", width: "100%" }}>
                  {MODALITIES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Goal title (as written)
                <input name="title" required style={{ display: "block", width: "100%" }} />
              </label>
              <button type="submit">Create goal</button>
            </form>
          ) : null}
        </>
      ) : null}

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      <table style={{ marginTop: "1.5rem", borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={cellStyle}>Kid</th>
            <th style={cellStyle}>Title</th>
            <th style={cellStyle}>Canonical skill</th>
            <th style={cellStyle}>Discipline</th>
            <th style={cellStyle}>Modality</th>
            <th style={cellStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {goals.map((g) => (
            <tr key={g.id}>
              <td style={cellStyle}>
                {g.kid.firstName} {g.kid.lastName}
              </td>
              <td style={cellStyle}>{g.title}</td>
              <td style={cellStyle}>{g.canonicalSkill.name}</td>
              <td style={cellStyle}>{g.discipline.name}</td>
              <td style={cellStyle}>{g.modality}</td>
              <td style={cellStyle}>{g.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {goals.length === 0 ? <p style={{ color: "#888" }}>No goals visible to your account yet.</p> : null}
    </div>
  );
}

const cellStyle = { border: "1px solid #ddd", padding: "0.5rem", textAlign: "left" as const };

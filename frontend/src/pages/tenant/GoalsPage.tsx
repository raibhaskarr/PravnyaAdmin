import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { CanonicalDomain, CanonicalSkillDetail, Goal, GoalItemInput, Kid, Modality, TenantDiscipline } from "../../api/types";

const MODALITIES: Modality[] = ["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL"];

export function GoalsPage() {
  const { token, user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [kids, setKids] = useState<Kid[]>([]);
  const [domains, setDomains] = useState<CanonicalDomain[]>([]);
  const [disciplines, setDisciplines] = useState<TenantDiscipline[]>([]);
  const [skills, setSkills] = useState<{ id: string; name: string }[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<CanonicalSkillDetail | null>(null);
  const [pendingItems, setPendingItems] = useState<(GoalItemInput & { label: string })[]>([]);
  const [customText, setCustomText] = useState("");
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

  function resetItemPicker() {
    setSelectedSkill(null);
    setPendingItems([]);
    setCustomText("");
  }

  async function handleSkillChange(skillId: string) {
    setPendingItems([]);
    if (!skillId) {
      setSelectedSkill(null);
      return;
    }
    setSelectedSkill(await api.getSkill(token!, skillId));
  }

  function addCanonicalItem(itemId: string, displayName: string) {
    if (pendingItems.some((i) => i.canonicalSkillItemId === itemId)) return;
    setPendingItems((prev) => [...prev, { canonicalSkillItemId: itemId, label: displayName }]);
  }

  function addCustomItem() {
    const value = customText.trim();
    if (!value) return;
    setPendingItems((prev) => [...prev, { customText: value, label: value }]);
    setCustomText("");
  }

  function removeItem(index: number) {
    setPendingItems((prev) => prev.filter((_, i) => i !== index));
  }

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
        title: String(form.get("title")),
        items: pendingItems.map(({ canonicalSkillItemId, customText: text }) => ({ canonicalSkillItemId, customText: text }))
      });
      setShowForm(false);
      event.currentTarget.reset();
      setSelectedDomainId("");
      resetItemPicker();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create goal");
    }
  }

  function goalItemLabel(item: Goal["items"][number]) {
    return item.customText ?? item.canonicalSkillItem?.displayName ?? "—";
  }

  return (
    <div>
      <h1>Goals</h1>

      {canEdit ? (
        <>
          <div className="page-toolbar">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowForm((v) => !v);
                resetItemPicker();
              }}
            >
              {showForm ? "Cancel" : "New goal"}
            </button>
          </div>
          {showForm ? (
            <form onSubmit={handleCreate} className="form-panel" style={{ maxWidth: 480 }}>
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
                <select
                  name="canonicalSkillId"
                  required
                  disabled={!skills.length}
                  className="input"
                  onChange={(e) => handleSkillChange(e.target.value)}
                >
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

              <fieldset className="form-group">
                <legend>Items for this kid</legend>

                {selectedSkill?.supportsItems && selectedSkill.items.length > 0 ? (
                  <>
                    <p className="hint-text" style={{ marginBottom: "0.4rem" }}>
                      Pick from the shared bank for this skill:
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
                      {selectedSkill.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => addCanonicalItem(item.id, item.displayName)}
                        >
                          + {item.displayName}
                        </button>
                      ))}
                    </div>
                  </>
                ) : selectedSkill && !selectedSkill.supportsItems ? (
                  <p className="hint-text" style={{ marginBottom: "0.75rem" }}>
                    This skill is tracked by duration/independence -- no item bank to pick from.
                  </p>
                ) : null}

                <p className="hint-text" style={{ marginBottom: "0.4rem" }}>
                  Or add this kid's own custom content (e.g. the actual question text):
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    className="input"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="e.g. Where do you live?"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomItem();
                      }
                    }}
                  />
                  <button type="button" className="btn btn-secondary" onClick={addCustomItem}>
                    Add
                  </button>
                </div>

                {pendingItems.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.75rem" }}>
                    {pendingItems.map((item, index) => (
                      <span key={index} className="tag tag-framework" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                        {item.label}
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          aria-label={`Remove ${item.label}`}
                          style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: "inherit" }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </fieldset>

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
              <th>Items</th>
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
                <td>{g.items.length ? g.items.map(goalItemLabel).join(", ") : "—"}</td>
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

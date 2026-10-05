import { Fragment, FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { CanonicalDomain, CanonicalSkillDetail, Goal, GoalItemInput, Modality, TenantDiscipline } from "../../api/types";
import { GoalEvidenceDetail } from "./goalEvidence";
import { LogEvidenceForm } from "./LogEvidenceForm";

const MODALITIES: Modality[] = ["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL"];

function goalItemLabel(item: Goal["items"][number]) {
  return item.customText ?? item.canonicalSkillItem?.displayName ?? "—";
}

export function KidGoalsTab({ kidId, canEdit }: { kidId: string; canEdit: boolean }) {
  const { token } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [domains, setDomains] = useState<CanonicalDomain[]>([]);
  const [disciplines, setDisciplines] = useState<TenantDiscipline[]>([]);
  const [skills, setSkills] = useState<{ id: string; name: string }[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<CanonicalSkillDetail | null>(null);
  const [pendingItems, setPendingItems] = useState<(GoalItemInput & { label: string })[]>([]);
  const [customText, setCustomText] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [error, setError] = useState("");
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [canonicalSkillId, setCanonicalSkillId] = useState("");
  const [disciplineId, setDisciplineId] = useState("");
  const [modality, setModality] = useState<Modality | "">("");
  const [pendingSkillId, setPendingSkillId] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState("");

  const suggestedModalities = selectedSkill?.supportedModalities ?? [];

  function load() {
    api.listGoals(token!, kidId).then(setGoals);
    api.listDomains(token!).then(setDomains);
    api.listTenantDisciplines(token!).then(setDisciplines);
  }

  useEffect(load, [token, kidId]);

  useEffect(() => {
    if (!selectedDomainId) {
      setSkills([]);
      return;
    }
    api.listSkills(token!, selectedDomainId).then(setSkills);
  }, [token, selectedDomainId]);

  useEffect(() => {
    if (!pendingSkillId) return;
    if (skills.some((s) => s.id === pendingSkillId)) {
      handleSkillChange(pendingSkillId);
      setCanonicalSkillId(pendingSkillId);
      setPendingSkillId("");
    }
  }, [skills, pendingSkillId]);

  function resetFormState() {
    setSelectedSkill(null);
    setPendingItems([]);
    setCustomText("");
    setTitle("");
    setCanonicalSkillId("");
    setDisciplineId("");
    setModality("");
    setPendingSkillId("");
    setSuggestNote("");
  }

  async function handleSkillChange(skillId: string) {
    setPendingItems([]);
    if (!skillId) {
      setSelectedSkill(null);
      return;
    }
    setSelectedSkill(await api.getSkill(token!, skillId));
  }

  async function handleSuggest() {
    const trimmed = title.trim();
    if (!trimmed) {
      setSuggestNote("Type a goal title first.");
      return;
    }
    setSuggesting(true);
    setSuggestNote("");
    try {
      const result = await api.suggestGoalSkill(token!, trimmed);
      if (!result.suggestion) {
        setSuggestNote(result.reason ?? "No suggestion available -- pick manually below.");
        return;
      }
      const { domainId, canonicalSkillId: skillId, disciplineId: discId, modality: mod, rationale } = result.suggestion;
      setSelectedDomainId(domainId);
      setPendingSkillId(skillId);
      setDisciplineId(discId ?? "");
      setModality(mod ?? "");
      setSuggestNote(rationale);
    } catch {
      setSuggestNote("Couldn't reach the AI suggestion service -- pick manually below.");
    } finally {
      setSuggesting(false);
    }
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
    try {
      await api.createGoal(token!, {
        kidId,
        canonicalSkillId,
        disciplineId,
        modality: modality as Modality,
        title,
        items: pendingItems.map(({ canonicalSkillItemId, customText: text }) => ({ canonicalSkillItemId, customText: text }))
      });
      setShowForm(false);
      setSelectedDomainId("");
      resetFormState();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create goal");
    }
  }

  return (
    <div>
      {canEdit ? (
        <>
          <div className="page-toolbar">
            <button
              type="button"
              className={`btn ${showLogForm ? "btn-secondary" : "btn-primary"}`}
              onClick={() => {
                setShowLogForm((v) => !v);
                setShowForm(false);
              }}
              disabled={goals.length === 0}
              title={goals.length === 0 ? "Create a goal first" : undefined}
            >
              {showLogForm ? "Cancel" : "+ Log a session"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setShowForm((v) => !v);
                setShowLogForm(false);
                resetFormState();
              }}
            >
              {showForm ? "Cancel" : "New goal"}
            </button>
          </div>
          {showLogForm ? <LogEvidenceForm goals={goals} onLogged={load} /> : null}
          {showForm ? (
            <form onSubmit={handleCreate} className="form-panel" style={{ maxWidth: 480 }}>
              <label className="field">
                <span className="field-label">Goal title (as written)</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required className="input" />
              </label>
              <div style={{ marginTop: "-0.5rem", marginBottom: "0.75rem" }}>
                <button type="button" className="btn btn-secondary" onClick={handleSuggest} disabled={suggesting}>
                  {suggesting ? "Suggesting…" : "Suggest skill from title (AI)"}
                </button>
                {suggestNote ? (
                  <p className="hint-text" style={{ marginTop: "0.4rem" }}>
                    {suggestNote}
                  </p>
                ) : null}
              </div>

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
                  required
                  disabled={!skills.length}
                  className="input"
                  value={canonicalSkillId}
                  onChange={(e) => {
                    setCanonicalSkillId(e.target.value);
                    handleSkillChange(e.target.value);
                  }}
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
                <select required className="input" value={disciplineId} onChange={(e) => setDisciplineId(e.target.value)}>
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
                <select required className="input" value={modality} onChange={(e) => setModality(e.target.value as Modality)}>
                  <option value="">Select a modality</option>
                  {suggestedModalities.length > 0 && suggestedModalities.length < MODALITIES.length ? (
                    <>
                      <optgroup label="Suggested for this skill">
                        {suggestedModalities.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Other modalities">
                        {MODALITIES.filter((m) => !suggestedModalities.includes(m)).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </optgroup>
                    </>
                  ) : (
                    MODALITIES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))
                  )}
                </select>
                {selectedSkill && suggestedModalities.length === 0 ? (
                  <span className="hint-text">This skill isn't typically tagged by communication modality.</span>
                ) : null}
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
              <th></th>
              <th>Title</th>
              <th>Canonical skill</th>
              <th>Discipline</th>
              <th>Modality</th>
              <th>Items</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((g) => {
              const evidenceCount = g.items.reduce((sum, i) => sum + i.evidence.length, 0);
              const isExpanded = expandedGoalId === g.id;
              return (
                <Fragment key={g.id}>
                  <tr>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "0.1rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => setExpandedGoalId(isExpanded ? null : g.id)}
                      >
                        {isExpanded ? "Hide" : "History"} {evidenceCount ? `(${evidenceCount})` : ""}
                      </button>
                    </td>
                    <td>{g.title}</td>
                    <td>{g.canonicalSkill.name}</td>
                    <td>{g.discipline.name}</td>
                    <td>{g.modality}</td>
                    <td>{g.items.length ? g.items.map(goalItemLabel).join(", ") : "—"}</td>
                    <td>{g.status}</td>
                  </tr>
                  {isExpanded ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <GoalEvidenceDetail goal={g} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {goals.length === 0 ? <p className="empty-state">No goals for this kid yet.</p> : null}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { CanonicalDomain, CanonicalSkill, CanonicalSkillDetail } from "../../api/types";

export function TaxonomyPage() {
  const { token } = useAuth();
  const [domains, setDomains] = useState<CanonicalDomain[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [skills, setSkills] = useState<CanonicalSkill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<CanonicalSkillDetail | null>(null);

  useEffect(() => {
    api.listDomains(token!).then((rows) => {
      setDomains(rows);
      if (rows.length && !selectedDomainId) setSelectedDomainId(rows[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!selectedDomainId) return;
    setSelectedSkill(null);
    api.listSkills(token!, selectedDomainId).then(setSkills);
  }, [token, selectedDomainId]);

  return (
    <div>
      <h1>Canonical Taxonomy</h1>
      <div className="taxonomy-columns">
        <div className="taxonomy-col taxonomy-col-domains">
          <h2>Domains ({domains.length})</h2>
          <ul className="taxonomy-list">
            {domains.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setSelectedDomainId(d.id)}
                  className={`taxonomy-item-btn ${d.id === selectedDomainId ? "active" : ""}`}
                >
                  {d.name}
                  {d._count ? ` (${d._count.skills})` : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="taxonomy-col taxonomy-col-skills">
          <h2>Skills ({skills.length})</h2>
          <ul className="taxonomy-list">
            {skills.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => api.getSkill(token!, s.id).then(setSelectedSkill)}
                  className={`taxonomy-item-btn ${s.id === selectedSkill?.id ? "active" : ""}`}
                >
                  {s.name}
                  <span className={`tag ${s.sourceTag === "PROD" ? "tag-prod" : "tag-framework"}`}>{s.sourceTag}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="taxonomy-col taxonomy-col-items">
          {selectedSkill ? (
            <div className="item-group">
              <div className="item-group-name">Modalities</div>
              <div className="item-group-values">
                {selectedSkill.supportedModalities.length > 0 ? (
                  selectedSkill.supportedModalities.map((m) => (
                    <span key={m} className="tag tag-framework">
                      {m}
                    </span>
                  ))
                ) : (
                  <span className="hint-text">Not modality-tagged</span>
                )}
              </div>
            </div>
          ) : null}
          <h2>Items</h2>
          {!selectedSkill ? (
            <p className="empty-state">Select a skill to see its item bank.</p>
          ) : !selectedSkill.supportsItems ? (
            <p className="empty-state">This skill is tracked by duration/independence, not an item bank.</p>
          ) : selectedSkill.items.length === 0 ? (
            <p className="empty-state">No items seeded for this skill yet.</p>
          ) : (
            <div>
              {Object.entries(groupByCategory(selectedSkill.items)).map(([group, items]) => (
                <div key={group} className="item-group">
                  <div className="item-group-name">{group}</div>
                  <div className="item-group-values">{items.map((i) => i.displayName).join(", ")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function groupByCategory(items: CanonicalSkillDetail["items"]) {
  return items.reduce<Record<string, CanonicalSkillDetail["items"]>>((acc, item) => {
    (acc[item.semanticGroup] ??= []).push(item);
    return acc;
  }, {});
}

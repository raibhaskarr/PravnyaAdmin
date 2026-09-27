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
      <div style={{ display: "flex", gap: "2rem" }}>
        <div style={{ width: 260 }}>
          <h2 style={{ fontSize: "1rem" }}>Domains ({domains.length})</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {domains.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setSelectedDomainId(d.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "0.35rem",
                    fontWeight: d.id === selectedDomainId ? "bold" : "normal",
                    background: d.id === selectedDomainId ? "#eef" : "transparent"
                  }}
                >
                  {d.name} {d._count ? `(${d._count.skills})` : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ width: 320 }}>
          <h2 style={{ fontSize: "1rem" }}>Skills ({skills.length})</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {skills.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => api.getSkill(token!, s.id).then(setSelectedSkill)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "0.35rem",
                    fontWeight: s.id === selectedSkill?.id ? "bold" : "normal",
                    background: s.id === selectedSkill?.id ? "#eef" : "transparent"
                  }}
                >
                  {s.name}
                  <span style={{ marginLeft: "0.4rem", fontSize: "0.75rem", color: s.sourceTag === "PROD" ? "#2a6" : "#999" }}>
                    [{s.sourceTag}]
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: "1rem" }}>Items</h2>
          {!selectedSkill ? (
            <p style={{ color: "#888" }}>Select a skill to see its item bank.</p>
          ) : !selectedSkill.supportsItems ? (
            <p style={{ color: "#888" }}>This skill is tracked by duration/independence, not an item bank.</p>
          ) : selectedSkill.items.length === 0 ? (
            <p style={{ color: "#888" }}>No items seeded for this skill yet.</p>
          ) : (
            <ul>
              {Object.entries(groupByCategory(selectedSkill.items)).map(([group, items]) => (
                <li key={group} style={{ marginBottom: "0.75rem" }}>
                  <strong>{group}</strong>
                  <div>{items.map((i) => i.displayName).join(", ")}</div>
                </li>
              ))}
            </ul>
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

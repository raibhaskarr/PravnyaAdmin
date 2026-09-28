import { useEffect, useState } from "react";
import { marked } from "marked";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { DbModel, DocSection } from "../api/types";

const DB_STRUCTURE_SLUG = "__db-structure__";

export function ManualPage() {
  const { token } = useAuth();
  const [docs, setDocs] = useState<DocSection[]>([]);
  const [dbModels, setDbModels] = useState<DbModel[]>([]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    api.listManualDocs(token!).then((rows) => {
      setDocs(rows);
      if (rows.length) setSelected(rows[0].slug);
    });
    api.getDbStructure(token!).then(setDbModels);
  }, [token]);

  const activeDoc = docs.find((d) => d.slug === selected);

  return (
    <div>
      <h1>Manual</h1>
      <p className="hint-text" style={{ marginBottom: "1.25rem" }}>
        Definitions and business logic ship with every deploy like any other code change. Database
        Structure below is generated live from the actual deployed schema, not a hand-copied
        snapshot.
      </p>
      <div className="taxonomy-columns">
        <div className="taxonomy-col taxonomy-col-domains">
          <h2>Sections</h2>
          <ul className="taxonomy-list">
            {docs.map((d) => (
              <li key={d.slug}>
                <button
                  type="button"
                  className={`taxonomy-item-btn ${selected === d.slug ? "active" : ""}`}
                  onClick={() => setSelected(d.slug)}
                >
                  {d.title}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={`taxonomy-item-btn ${selected === DB_STRUCTURE_SLUG ? "active" : ""}`}
                onClick={() => setSelected(DB_STRUCTURE_SLUG)}
              >
                Database Structure
              </button>
            </li>
          </ul>
        </div>

        <div className="taxonomy-col-items" style={{ flex: 1 }}>
          {selected === DB_STRUCTURE_SLUG ? (
            <DbStructureView models={dbModels} />
          ) : activeDoc ? (
            <div className="card manual-doc" dangerouslySetInnerHTML={{ __html: marked.parse(activeDoc.content) as string }} />
          ) : (
            <p className="empty-state">Loading...</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DbStructureView({ models }: { models: DbModel[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {models.map((m) => (
        <div key={m.name} className="card">
          <h2 style={{ fontSize: "1rem", textTransform: "none", letterSpacing: "normal", color: "var(--color-text)" }}>{m.name}</h2>
          {m.documentation ? <p className="hint-text" style={{ marginBottom: "0.75rem" }}>{m.documentation}</p> : null}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {m.fields.map((f) => (
                  <tr key={f.name}>
                    <td>{f.name}</td>
                    <td>{f.type}</td>
                    <td>
                      {[
                        f.isId ? "id" : null,
                        f.isRequired ? null : "optional",
                        f.isUnique ? "unique" : null,
                        f.isRelation ? "relation" : null,
                        f.documentation
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

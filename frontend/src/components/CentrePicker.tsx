import { useEffect, useState } from "react";
import { AutoComplete } from "primereact/autocomplete";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { Centre } from "../api/types";

// Same "search existing or add new" shape as KidSupportTeamTab.tsx's therapist-roster search and
// KidDetailPage.tsx's parent-linking search -- fetch the full directory once, filter client-side,
// AutoComplete picks the real object. The one thing neither of those needs: an inline "add new"
// affordance, since unlike a therapist roster or parent list, a brand-new centre is routine, not
// an edge case -- createCentre is an idempotent find-or-create server-side, so even a near-
// simultaneous duplicate submit can't create two rows for the same name.
export function CentrePicker({
  value,
  onChange,
  placeholder = "Search or type a new centre...",
  disabled
}: {
  value: Centre | null;
  onChange: (centre: Centre | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { token } = useAuth();
  const [centres, setCentres] = useState<Centre[]>([]);
  const [query, setQuery] = useState(value?.name ?? "");
  const [suggestions, setSuggestions] = useState<Centre[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listCentres(token!).then(setCentres);
  }, [token]);

  useEffect(() => {
    setQuery(value?.name ?? "");
  }, [value?.id]);

  function search(q: string) {
    const needle = q.trim().toLowerCase();
    setSuggestions(needle ? centres.filter((c) => c.name.toLowerCase().includes(needle)) : centres);
  }

  const trimmed = query.trim();
  const exactMatch = centres.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  const showCreateHint = trimmed.length > 0 && !exactMatch;

  async function handleCreateNew() {
    setCreating(true);
    try {
      const centre = await api.createCentre(token!, { name: trimmed });
      setCentres((prev) => [...prev, centre].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(centre);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <AutoComplete
        value={query}
        suggestions={suggestions}
        completeMethod={(e) => search(e.query)}
        field="name"
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const next = typeof e.value === "string" ? e.value : (e.value?.name ?? "");
          setQuery(next);
          if (next === "") onChange(null);
        }}
        onSelect={(e) => {
          const centre = e.value as Centre;
          setQuery(centre.name);
          onChange(centre);
        }}
        inputClassName="input"
        style={{ width: "100%" }}
      />
      {showCreateHint ? (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: "0.35rem", fontSize: "0.75rem" }}
          disabled={creating || disabled}
          onClick={handleCreateNew}
        >
          {creating ? "Adding..." : `+ Add "${trimmed}" as a new centre`}
        </button>
      ) : null}
    </div>
  );
}

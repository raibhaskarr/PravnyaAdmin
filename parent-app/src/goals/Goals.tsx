import { useEffect, useState } from "react";
import { api, ApiError, type Goal } from "../api/client";
import mark from "../brand/mark.svg";
import { LogEvidenceForm } from "./LogEvidenceForm";

const STATUS_LABEL: Record<Goal["status"], string> = {
  ACTIVE: "Active",
  ACHIEVED: "Achieved",
  DISCONTINUED: "Discontinued"
};

function evidenceCount(goal: Goal): number {
  return goal.items.reduce((sum, item) => sum + item.evidence.length, 0);
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const OUTCOME_LABEL: Record<string, string> = {
  CORRECT: "Did it independently",
  PARTIAL: "Needed a little help",
  ATTEMPTED: "Gave it a try",
  INCORRECT: "Not yet",
  NOT_OBSERVED: "Didn't get a chance",
  UNKNOWN: "Logged"
};

function GoalDetail({
  goal,
  token,
  kidId,
  onLogged,
  onBack
}: {
  goal: Goal;
  token: string;
  kidId: string;
  onLogged: () => void;
  onBack: () => void;
}) {
  const [logging, setLogging] = useState(false);
  const recentEvidence = goal.items
    .flatMap((item) => item.evidence.map((e) => ({ ...e, itemLabel: item.customText ?? item.canonicalSkillItem?.displayName ?? "General practice" })))
    .sort((a, b) => (b.logDate ?? "").localeCompare(a.logDate ?? ""))
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm font-medium text-[var(--pv-green-700)] hover:underline">
        ← All goals
      </button>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--pv-ink-faint)]">
          {goal.canonicalSkill.domain.name} · {goal.discipline.name}
        </p>
        <h2 className="mt-1 text-[1.3rem] font-semibold text-[var(--pv-ink)]">{goal.title}</h2>
      </div>

      {logging ? (
        <LogEvidenceForm
          goal={goal}
          token={token}
          kidId={kidId}
          onLogged={() => {
            setLogging(false);
            onLogged();
          }}
          onCancel={() => setLogging(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setLogging(true)}
          className="w-full rounded-2xl bg-[var(--pv-green-700)] px-5 py-3.5 text-[1.05rem] font-semibold text-white transition active:bg-[var(--pv-green-900)]"
        >
          Log something for this goal
        </button>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-[var(--pv-ink-soft)]">Recent entries</p>
        {recentEvidence.length === 0 ? (
          <p className="text-sm text-[var(--pv-ink-faint)]">Nothing logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentEvidence.map((e) => (
              <li key={e.id} className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--pv-ink)]">{e.itemLabel}</span>
                  <span className="text-xs text-[var(--pv-ink-faint)]">{formatDate(e.logDate)}</span>
                </div>
                <p className="text-sm text-[var(--pv-ink-soft)]">{OUTCOME_LABEL[e.outcome] ?? e.outcome}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function Goals({
  token,
  kidId,
  onBack
}: {
  token: string;
  kidId: string;
  onBack: () => void;
}) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function refetch() {
    return api
      .listGoals(token, kidId)
      .then(setGoals)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load goals. Try again."));
  }

  useEffect(() => {
    void refetch();
  }, [token, kidId]);

  const selected = goals?.find((g) => g.id === selectedId) ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3.5">
        <button type="button" onClick={selected ? () => setSelectedId(null) : onBack} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--pv-ink-soft)] transition hover:bg-[var(--pv-border)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">Goals</p>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !goals ? (
          <div className="flex justify-center py-10">
            <img src={mark} alt="" className="h-8 w-8 animate-pulse opacity-60" />
          </div>
        ) : selected ? (
          <GoalDetail goal={selected} token={token} kidId={kidId} onLogged={refetch} onBack={() => setSelectedId(null)} />
        ) : goals.length === 0 ? (
          <p className="text-sm text-[var(--pv-ink-faint)]">Goals show up here once they're added -- from an uploaded IEP or your care team.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {goals.map((goal) => (
              <li key={goal.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(goal.id)}
                  className="w-full rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3 text-left transition hover:border-[var(--pv-green-500)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.98rem] font-medium text-[var(--pv-ink)]">{goal.title}</p>
                    {goal.status !== "ACTIVE" ? (
                      <span className="flex-shrink-0 rounded-full bg-[var(--pv-border)] px-2 py-0.5 text-xs font-medium text-[var(--pv-ink-soft)]">
                        {STATUS_LABEL[goal.status]}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--pv-ink-faint)]">
                    {goal.canonicalSkill.domain.name} · {evidenceCount(goal)} entr{evidenceCount(goal) === 1 ? "y" : "ies"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

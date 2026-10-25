import { useEffect, useState } from "react";
import { api, ApiError, type Goal, type GoalItemEvidence } from "../api/client";
import mark from "../brand/mark.svg";
import { LogEvidenceForm } from "../goals/LogEvidenceForm";

// Faithful port of the admin panel's realActivities.tsx -- "Activities" = confirmation prompts,
// not practice suggestions. A centre logging evidence for a goal is one data point; it's stronger
// once it also shows up at home. Same Goal/GoalItem/evidence data Growth and Goals already fetch,
// no new backend endpoint, no AI call. Deterministic by design, same reasoning as the admin
// version's own comment: it decides what to ask, an AI would only phrase it.
//
// One real difference from the admin version: there the viewer is a therapist/admin looking at
// someone else's "to-do" list for a parent. Here the viewer IS the parent, so each card is
// tappable straight into the same LogEvidenceForm the Goals tab already uses, instead of being a
// read-only suggestion someone else has to go relay.

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function itemLabel(item: Goal["items"][number]): string {
  return item.customText ?? item.canonicalSkillItem?.displayName ?? "General practice";
}

interface EvidenceWithItem extends GoalItemEvidence {
  itemLabelText: string;
}

function flatEvidence(goal: Goal): EvidenceWithItem[] {
  return goal.items.flatMap((i) => i.evidence.map((e) => ({ ...e, itemLabelText: itemLabel(i) })));
}

export interface ActivityCandidate {
  goal: Goal;
  centreEvidenceCount: number;
  homeEvidenceCount: number;
  gap: number;
  suggestedItemLabel: string;
  suggestedCentreName: string;
  suggestedDate: string | null;
}

function pickSuggestedItem(goal: Goal): { itemLabel: string; centreName: string; date: string | null } | null {
  let best: { itemLabel: string; centreName: string; date: string | null; homeCount: number; centreDate: string } | null = null;
  for (const item of goal.items) {
    const centreEv = item.evidence.filter((e) => e.centre != null);
    const homeCount = item.evidence.filter((e) => e.centre == null).length;
    if (centreEv.length === 0 || homeCount >= centreEv.length) continue;
    const latest = [...centreEv].sort((a, b) => (b.logDate ?? "").localeCompare(a.logDate ?? ""))[0];
    const candidate = { itemLabel: itemLabel(item), centreName: latest.centre!.name, date: latest.logDate, homeCount, centreDate: latest.logDate ?? "" };
    if (!best || candidate.homeCount < best.homeCount || (candidate.homeCount === best.homeCount && candidate.centreDate > best.centreDate)) {
      best = candidate;
    }
  }
  return best;
}

export function buildActivityCandidates(goals: Goal[]): ActivityCandidate[] {
  const candidates: ActivityCandidate[] = [];
  for (const g of goals) {
    const all = flatEvidence(g);
    const centreEvidenceCount = all.filter((e) => e.centre != null).length;
    const homeEvidenceCount = all.filter((e) => e.centre == null).length;
    if (centreEvidenceCount === 0 || homeEvidenceCount >= centreEvidenceCount) continue;

    const suggested = pickSuggestedItem(g);
    if (!suggested) continue;

    candidates.push({
      goal: g,
      centreEvidenceCount,
      homeEvidenceCount,
      gap: centreEvidenceCount - homeEvidenceCount,
      suggestedItemLabel: suggested.itemLabel,
      suggestedCentreName: suggested.centreName,
      suggestedDate: suggested.date
    });
  }
  return candidates.sort((a, b) => b.gap - a.gap || (b.suggestedDate ?? "").localeCompare(a.suggestedDate ?? ""));
}

function ActivityCard({ candidate, onSelect }: { candidate: ActivityCandidate; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3.5 text-left shadow-sm transition hover:border-[var(--pv-green-500)]"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">
            {candidate.goal.canonicalSkill.domain.name} · {candidate.goal.discipline.name}
          </p>
          <p className="mt-0.5 text-[0.95rem] font-semibold text-[var(--pv-ink)]">{candidate.goal.title}</p>
        </div>
        <span className="flex-shrink-0 whitespace-nowrap rounded-full border border-[var(--pv-border)] bg-[var(--pv-bg)] px-2.5 py-1 text-[0.68rem] font-bold text-[var(--pv-ink-soft)]">
          Centre {candidate.centreEvidenceCount} · Home {candidate.homeEvidenceCount}
        </span>
      </div>
      <p className="mt-2 text-[0.85rem] leading-relaxed text-[var(--pv-ink-soft)]">
        Confirmed at <b className="font-bold text-[var(--pv-ink)]">{candidate.suggestedCentreName}</b>
        {candidate.suggestedDate ? ` on ${formatDate(candidate.suggestedDate)}` : ""} — try "
        <b className="font-bold text-[var(--pv-ink)]">{candidate.suggestedItemLabel}</b>" at home and log what happens.
      </p>
    </button>
  );
}

export function Activities({ token, kidId, onBack }: { token: string; kidId: string; onBack: () => void }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  function refetch() {
    return api
      .listGoals(token, kidId)
      .then(setGoals)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load activities. Try again."));
  }

  useEffect(() => {
    void refetch();
  }, [token, kidId]);

  const candidates = goals ? buildActivityCandidates(goals) : [];
  const selected = candidates.find((c) => c.goal.id === selectedGoalId) ?? null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3.5">
        <button
          type="button"
          onClick={selected ? () => setSelectedGoalId(null) : onBack}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--pv-ink-soft)] transition hover:bg-[var(--pv-border)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">Activities</p>
      </header>

      <main className="mx-auto w-full min-h-0 max-w-2xl flex-1 overflow-y-auto px-5 py-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !goals ? (
          <div className="flex justify-center py-10">
            <img src={mark} alt="" className="h-8 w-8 animate-pulse opacity-60" />
          </div>
        ) : selected ? (
          <LogEvidenceForm
            goal={selected.goal}
            token={token}
            kidId={kidId}
            onLogged={() => {
              setSelectedGoalId(null);
              void refetch();
            }}
            onCancel={() => setSelectedGoalId(null)}
          />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-[var(--pv-ink-faint)]">
            Nothing waiting on a home try right now -- every goal with centre evidence already has at least as much logged at home.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-[0.85rem] text-[var(--pv-ink-faint)]">
              {candidates.length} goal{candidates.length === 1 ? "" : "s"} waiting on a home try
            </p>
            <div className="flex flex-col gap-2.5">
              {candidates.map((c) => (
                <ActivityCard key={c.goal.id} candidate={c} onSelect={() => setSelectedGoalId(c.goal.id)} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, ApiError, type Goal, type GoalItemEvidence } from "../api/client";
import mark from "../brand/mark.svg";
import { Walkthrough } from "./Walkthrough";
import { PracticeCard, SessionCard } from "../sessions/Sessions";
import type { HomeSessionSummary, PracticeStatus, VisualSchedule } from "../api/client";
import { ScheduleCard, SYMBOL_CREDIT } from "../schedules/VisualSchedules";

// Faithful port of the admin panel's realActivities.tsx -- "Activities" = confirmation prompts,
// not practice suggestions. A centre logging evidence for a goal is one data point; it's stronger
// once it also shows up at home. Same Goal/GoalItem/evidence data Growth and Goals already fetch,
// no new backend endpoint, no AI call. Deterministic by design, same reasoning as the admin
// version's own comment: it decides what to ask, an AI would only phrase it.
//
// One real difference from the admin version: there the viewer is a therapist/admin looking at
// someone else's "to-do" list for a parent. Here the viewer IS the parent, so each card opens a
// step-by-step walkthrough of the activity (Walkthrough.tsx) that ends in logging how it went.

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
        <b className="font-bold text-[var(--pv-ink)]">{candidate.suggestedItemLabel}</b>" at home.
      </p>
      <p className="mt-2 text-[0.9rem] font-semibold text-[var(--pv-green-700)]">Start the activity →</p>
    </button>
  );
}

export function Activities({
  token,
  kidId,
  kidName = "your child",
  sessions = [],
  onStartSession,
  onStartPractice,
  visualSchedules = [],
  onOpenSchedule,
  onMakeSchedule,
  hasAacBoard = false,
  onOpenAac
}: {
  token: string;
  kidId: string;
  kidName?: string;
  /** Guided sessions the therapist set, shown above the suggestions. */
  sessions?: HomeSessionSummary[];
  onStartSession?: (sessionId: string) => void;
  /** A practice session Pravnya puts together from the child's goals. */
  onStartPractice?: (language: "en" | "hi") => void;
  /** Picture schedules the therapist made, to show the child. */
  visualSchedules?: VisualSchedule[];
  onOpenSchedule?: (id: string) => void;
  /** The parent makes their own (Pravnya drafts it from what they type or say). */
  onMakeSchedule?: () => void;
  /** The child's talking (AAC) board: open it, or set one up. */
  hasAacBoard?: boolean;
  onOpenAac?: () => void;
}) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [practice, setPractice] = useState<PracticeStatus | null>(null);
  const [practiceLanguage, setPracticeLanguage] = useState<"en" | "hi">(() => {
    try {
      return localStorage.getItem("pv.practice.language") === "hi" ? "hi" : "en";
    } catch {
      return "en";
    }
  });
  function chooseLanguage(l: "en" | "hi") {
    setPracticeLanguage(l);
    try {
      localStorage.setItem("pv.practice.language", l);
    } catch {
      // not remembered; fine
    }
  }
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
    if (onStartPractice) {
      api
        .getPracticeStatus(token, kidId)
        .then(setPractice)
        .catch(() => setPractice(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, kidId]);

  const candidates = goals ? buildActivityCandidates(goals) : [];
  const selected = candidates.find((c) => c.goal.id === selectedGoalId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--pv-bg)]">
      <header className="flex min-h-16 items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3.5">
        {selected ? (
          <button type="button" onClick={() => setSelectedGoalId(null)} aria-label="Back to activities" className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--pv-ink-soft)] transition hover:bg-[var(--pv-border)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
        <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">{selected ? "Activity" : "Activities"}</p>
      </header>

      <main className="mx-auto w-full min-h-0 max-w-2xl flex-1 overflow-y-auto px-5 py-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !goals ? (
          <div className="flex justify-center py-10">
            <img src={mark} alt="" className="h-8 w-8 animate-pulse opacity-60" />
          </div>
        ) : selected ? (
          <Walkthrough
            key={selected.goal.id}
            token={token}
            kidId={kidId}
            kidName={kidName}
            goal={selected.goal}
            onDone={() => {
              setSelectedGoalId(null);
              void refetch();
            }}
            onBack={() => setSelectedGoalId(null)}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {practice?.available && onStartPractice ? (
              <PracticeCard status={practice} kidName={kidName} language={practiceLanguage} onLanguage={chooseLanguage} onStart={() => onStartPractice(practiceLanguage)} />
            ) : null}
            {sessions.length > 0 && onStartSession ? (
              <section className="flex flex-col gap-2.5">
                <h2 className="text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">Sessions from your therapist</h2>
                {sessions.map((s) => (
                  <SessionCard key={s.id} session={s} onStart={() => onStartSession(s.id)} />
                ))}
              </section>
            ) : null}
            {onOpenAac ? (
              <section className="flex flex-col gap-2.5">
                <h2 className="text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">Talking board (AAC)</h2>
                <button type="button" onClick={onOpenAac} className="flex items-center gap-3 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-4 text-left">
                  <span className="text-2xl">🗣️</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[1rem] font-semibold text-[var(--pv-ink)]">{hasAacBoard ? `Open ${kidName}'s board` : "Set up a talking board"}</span>
                    <span className="block text-xs text-[var(--pv-ink-faint)]">
                      {hasAacBoard ? "Tap pictures to say words. Hold \"Hold to edit\" to change it." : `Pictures ${kidName} taps to say words out loud, in English or Hindi.`}
                    </span>
                  </span>
                </button>
              </section>
            ) : null}
            {onOpenSchedule && (visualSchedules.length > 0 || onMakeSchedule) ? (
              <section className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">Picture schedules</h2>
                  {onMakeSchedule ? (
                    <button type="button" onClick={onMakeSchedule} className="text-sm font-semibold text-[var(--pv-green-700)]">
                      + Make one
                    </button>
                  ) : null}
                </div>
                {visualSchedules.length === 0 ? (
                  <p className="text-[0.85rem] text-[var(--pv-ink-faint)]">Picture schedules help {kidName} know what comes next: brushing teeth, getting ready, bedtime. Make one by typing or saying what you need.</p>
                ) : null}
                {visualSchedules.map((s) => (
                  <ScheduleCard key={s.id} schedule={s} onOpen={() => onOpenSchedule(s.id)} />
                ))}
                {visualSchedules.length ? <p className="text-[0.65rem] text-[var(--pv-ink-faint)]">{SYMBOL_CREDIT}</p> : null}
              </section>
            ) : null}
            <section>
        {candidates.length === 0 ? (
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
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

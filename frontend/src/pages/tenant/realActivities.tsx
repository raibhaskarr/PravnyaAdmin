import { formatDate, itemLabel } from "./goalEvidence";
import { environmentLabel, REAL_GROWTH_CSS } from "./realGrowth";
import type { Goal, GoalItemEvidenceRow } from "../../api/types";

// "Activities" = confirmation prompts, not practice suggestions. A centre logging evidence for a
// goal is one data point; it's stronger once it also shows up at home. This view surfaces exactly
// the goals where that confirmation hasn't happened yet -- same Goal/GoalItem/GoalItemEvidenceRow
// data Growth already fetches, no new backend endpoint, no AI call. Deterministic by design (see
// the L11 companion series' own conclusion: AI phrases text, it doesn't decide what to ask).
//
// Candidate rule: a goal needs a home-confirmation activity when it has centre evidence and fewer
// home entries than centre entries (mirrors PranTrackingSystem's shipped `GoalFocus` recommendation
// rule -- `alignmentStatus === "CentreOnly" && homeEvidenceCount < centreEvidenceCount` -- adapted
// to the plain centreName-or-null shape this codebase already uses instead of a separate
// alignmentStatus field). No overwhelm/cap logic here: this is a therapist/admin browsing a list,
// not a parent-facing push feed -- that cadence concern belongs to the parent app, not this view.

interface EvidenceWithItem extends GoalItemEvidenceRow {
  itemLabelText: string;
}

function flatEvidence(goal: Goal): EvidenceWithItem[] {
  return goal.items.flatMap((i) => i.evidence.map((e) => ({ ...e, itemLabelText: itemLabel(i) })));
}

export interface ActivityCandidate {
  goalId: string;
  goalTitle: string;
  domainName: string;
  disciplineName: string;
  centreEvidenceCount: number;
  homeEvidenceCount: number;
  gap: number;
  /** The item to suggest trying at home -- the one most recently confirmed by a centre that has
   * the least home evidence of its own, so the suggestion always points at something real and
   * current rather than an arbitrary pick. */
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
      goalId: g.id,
      goalTitle: g.title,
      domainName: g.canonicalSkill.domain.name,
      disciplineName: g.discipline.name,
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

function ActivityCard({ candidate }: { candidate: ActivityCandidate }) {
  return (
    <div className="gp-card gp-activity-card">
      <div className="gp-activity-head">
        <div>
          <div className="gp-domain-label" style={{ margin: 0 }}>
            {candidate.domainName} · {candidate.disciplineName}
          </div>
          <div className="gp-skill-name" style={{ marginTop: "0.2rem" }}>
            {candidate.goalTitle}
          </div>
        </div>
        <span className="gp-gap-badge">
          Centre {candidate.centreEvidenceCount} · Home {candidate.homeEvidenceCount}
        </span>
      </div>
      <p className="gp-activity-phrase">
        Confirmed at <b>{candidate.suggestedCentreName}</b>
        {candidate.suggestedDate ? ` on ${formatDate(candidate.suggestedDate)}` : ""} — try "<b>{candidate.suggestedItemLabel}</b>" at home and log
        what happens.
      </p>
    </div>
  );
}

export function RealActivitiesView({ kidLabel, goals }: { kidLabel: string; goals: Goal[] }) {
  const candidates = buildActivityCandidates(goals);

  return (
    <div className="gp-root">
      <style>{REAL_GROWTH_CSS}</style>
      <style>{REAL_ACTIVITIES_EXTRA_CSS}</style>
      <div className="gp-screen">
        <div className="gp-app-topbar">
          <div className="gp-avatar">{kidLabel.charAt(0)}</div>
          <div>
            <div className="gp-child-name">{kidLabel}'s Activities</div>
            <div className="gp-child-sub">
              {candidates.length} goal{candidates.length === 1 ? "" : "s"} waiting on home confirmation
            </div>
          </div>
        </div>
        {candidates.length === 0 ? (
          <p className="gp-empty">
            No confirmation activities right now — every goal with centre evidence already has at least as much home evidence.
          </p>
        ) : (
          candidates.map((c) => <ActivityCard key={c.goalId} candidate={c} />)
        )}
      </div>
    </div>
  );
}

const REAL_ACTIVITIES_EXTRA_CSS = `
.gp-activity-card { padding: 1rem 1.1rem; }
.gp-activity-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.6rem; margin-bottom: 0.6rem; }
.gp-gap-badge { flex-shrink: 0; font-size: 0.68rem; font-weight: 700; color: var(--gp-ink-soft); background: var(--gp-bg); border: 1px solid var(--gp-border); border-radius: 999px; padding: 0.25rem 0.6rem; white-space: nowrap; }
.gp-activity-phrase { margin: 0; font-size: 0.85rem; color: var(--gp-ink-soft); line-height: 1.5; }
.gp-activity-phrase b { color: var(--gp-ink); font-weight: 700; }
`;

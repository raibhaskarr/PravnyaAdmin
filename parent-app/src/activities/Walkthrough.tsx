import { useEffect, useState } from "react";
import { api, ApiError, type Goal, type Walkthrough as WalkthroughData } from "../api/client";
import mark from "../brand/mark.svg";
import { LogEvidenceForm } from "../goals/LogEvidenceForm";

// One activity, one step per screen: what you need -> the steps -> how to help if it's hard ->
// how you'll know -> log how it went. The steps come from the skill's guide (written once per
// skill, reviewed by the Pravnya team); the child's item, last level of help and the therapist's
// own notes are filled in around it.

const HELP: Record<string, string> = {
  INDEPENDENT: "no help",
  VISUAL_PROMPT: "a picture or visual cue",
  VERBAL_PROMPT: "a spoken reminder",
  GESTURAL_PROMPT: "a point or gesture",
  PHYSICAL_PROMPT: "some hands-on help",
  PARTIAL_ASSISTANCE: "some hands-on help",
  FULL_ASSISTANCE: "full hands-on help"
};

function day(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

type Page = { key: string; title: string; body: React.ReactNode };

function Card({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "green" }) {
  return <div className={`rounded-2xl border p-4 ${tone === "green" ? "border-transparent bg-[var(--pv-green-100)]" : "border-[var(--pv-border)] bg-[var(--pv-surface)]"}`}>{children}</div>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-[1rem] leading-relaxed text-[var(--pv-ink)]">
      {items.map((i, n) => (
        <li key={n}>{i}</li>
      ))}
    </ul>
  );
}

function pages(w: WalkthroughData, kidName: string): Page[] {
  const g = w.guide;
  const help = w.lastAtCentre ? HELP[w.lastAtCentre.supportLevel] : undefined;
  const out: Page[] = [
    {
      key: "start",
      title: w.goal.title,
      body: (
        <div className="flex flex-col gap-3">
          <p className="text-[1.02rem] leading-relaxed text-[var(--pv-ink)]">{g.summary}</p>
          {w.item ? (
            <Card tone="green">
              <p className="text-sm font-semibold text-[var(--pv-green-700)]">Today, try it with</p>
              <p className="text-[1.25rem] font-semibold text-[var(--pv-ink)]">{w.item.label}</p>
            </Card>
          ) : null}
          <p className="text-sm text-[var(--pv-ink-faint)]">About {g.minutes} minutes</p>
          {g.materials.length ? (
            <Card>
              <p className="mb-1.5 text-sm font-semibold text-[var(--pv-ink-soft)]">What you need</p>
              <Bullets items={g.materials} />
            </Card>
          ) : null}
          {w.fromPlan ? (
            <Card>
              <p className="mb-1.5 text-sm font-semibold text-[var(--pv-ink-soft)]">From {kidName}'s plan, by {w.fromPlan.authorName}</p>
              {w.fromPlan.target ? <p className="mb-1.5 text-[0.98rem] text-[var(--pv-ink)]">Aiming for: {w.fromPlan.target}</p> : null}
              {w.fromPlan.homePractice.length ? <Bullets items={w.fromPlan.homePractice} /> : null}
            </Card>
          ) : null}
        </div>
      )
    }
  ];
  g.steps.forEach((s, i) =>
    out.push({
      key: `step-${i}`,
      title: `Step ${i + 1}: ${s.title}`,
      body: <p className="whitespace-pre-line text-[1.05rem] leading-relaxed text-[var(--pv-ink)]">{s.detail}</p>
    })
  );
  out.push({
    key: "hard",
    title: "If it's hard",
    body: (
      <div className="flex flex-col gap-3">
        {help && w.lastAtCentre ? (
          <Card tone="green">
            <p className="text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">
              {w.lastAtCentre.supportLevel === "INDEPENDENT" ? (
                <>
                  Last time at {w.lastAtCentre.centreName ?? "the centre"} ({day(w.lastAtCentre.date)}), {kidName} did it <b>on their own</b>. Give them the chance to do it without help first.
                </>
              ) : (
                <>
                  Last time at {w.lastAtCentre.centreName ?? "the centre"} ({day(w.lastAtCentre.date)}), {kidName} needed <b>{help}</b>. Start with about that much help, then try a little less.
                </>
              )}
            </p>
          </Card>
        ) : null}
        <p className="text-sm font-semibold text-[var(--pv-ink-soft)]">Try these in order, least help first:</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-[1rem] leading-relaxed text-[var(--pv-ink)]">
          {g.ifItsHard.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ol>
      </div>
    )
  });
  out.push({
    key: "done",
    title: "How you'll know it worked",
    body: (
      <div className="flex flex-col gap-3">
        <p className="text-[1.02rem] leading-relaxed text-[var(--pv-ink)]">{g.success}</p>
        {g.keepItFun.length ? (
          <Card>
            <p className="mb-1.5 text-sm font-semibold text-[var(--pv-ink-soft)]">Keep it fun</p>
            <Bullets items={g.keepItFun} />
          </Card>
        ) : null}
        <Card>
          <p className="mb-1 text-sm font-semibold text-[var(--pv-ink-soft)]">When to stop</p>
          <p className="text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">{g.stopIf}</p>
        </Card>
      </div>
    )
  });
  return out;
}

export function Walkthrough({ token, kidId, kidName, goal, onDone, onBack }: { token: string; kidId: string; kidName: string; goal: Goal; onDone: () => void; onBack: () => void }) {
  const [data, setData] = useState<WalkthroughData | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    api
      .getWalkthrough(token, kidId, goal.id)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this activity. Try again."));
  }, [token, kidId, goal.id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <img src={mark} alt="" className="h-8 w-8 animate-pulse opacity-60" />
        <p className="text-sm text-[var(--pv-ink-faint)]">Getting the steps ready...</p>
      </div>
    );
  }

  if (logging) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">How did it go?</p>
        <LogEvidenceForm goal={goal} token={token} kidId={kidId} initialItemId={data.item?.goalItemId ?? null} onLogged={onDone} onCancel={() => setLogging(false)} />
      </div>
    );
  }

  const all = pages(data, kidName);
  const current = all[page];
  const last = page === all.length - 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5" aria-label={`Page ${page + 1} of ${all.length}`}>
        {all.map((p, i) => (
          <span key={p.key} className={`h-1.5 flex-1 rounded-full ${i <= page ? "bg-[var(--pv-green-700)]" : "bg-[var(--pv-border)]"}`} />
        ))}
      </div>
      <h2 className="text-[1.25rem] font-semibold leading-snug text-[var(--pv-ink)]">{current.title}</h2>
      {current.body}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (page === 0 ? onBack() : setPage(page - 1))}
          className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3.5 text-[1rem] font-semibold text-[var(--pv-ink-soft)]"
        >
          {page === 0 ? "Not now" : "Back"}
        </button>
        <button
          type="button"
          onClick={() => (last ? setLogging(true) : setPage(page + 1))}
          className="flex-1 rounded-2xl bg-[var(--pv-green-700)] px-5 py-3.5 text-[1.05rem] font-semibold text-white"
        >
          {page === 0 ? "Let's start" : last ? "Log how it went" : "Next"}
        </button>
      </div>
      {!last ? (
        <button type="button" onClick={() => setLogging(true)} className="text-[0.88rem] font-medium text-[var(--pv-ink-faint)]">
          Already done it? Log it now
        </button>
      ) : null}
      {data.guideKind === "drafted" ? (
        <p className="text-xs text-[var(--pv-ink-faint)]">Steps written by Pravnya. If your therapist suggests something different, follow their advice.</p>
      ) : data.guideKind === "general" ? (
        <p className="text-xs text-[var(--pv-ink-faint)]">General steps for any skill. Your therapist can tell you more about this one.</p>
      ) : null}
    </div>
  );
}

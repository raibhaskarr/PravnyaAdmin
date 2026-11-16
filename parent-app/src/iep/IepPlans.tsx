import { useEffect, useState } from "react";
import { api, type IepPlan } from "../api/client";

function from(p: IepPlan) {
  return p.centreName ? `${p.authorName} · ${p.centreName}` : p.authorName;
}

function date(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Card for a shared plan: on Home while it's unread, and at the top of Goals. */
export function IepPlanCard({ plan, kidName, onOpen }: { plan: IepPlan; kidName: string; onOpen: () => void }) {
  const unread = !plan.readAt;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-2xl border bg-[var(--pv-surface)] p-4 text-left transition hover:border-[var(--pv-green-700)] ${unread ? "border-[var(--pv-green-700)]" : "border-[var(--pv-border)]"}`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pv-green-100)] text-sm">📋</span>
        <span className="text-sm font-medium text-[var(--pv-ink-faint)]">{kidName}'s plan from {from(plan)}</span>
        {unread ? <span className="ml-auto rounded-full bg-[var(--pv-green-700)] px-2 py-0.5 text-[0.7rem] font-bold text-white">New</span> : null}
      </div>
      <p className="text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">
        {plan.title}: {plan.content.goals.length} goal{plan.content.goals.length === 1 ? "" : "s"}, to review on {date(plan.reviewDate)}.
      </p>
      <p className="mt-2 text-sm font-semibold text-[var(--pv-green-700)]">See the plan</p>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-[var(--pv-ink-faint)]">{title}</h3>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">
      {items.map((i, n) => (
        <li key={n}>{i}</li>
      ))}
    </ul>
  );
}

function PlanBody({ plan }: { plan: IepPlan }) {
  const c = plan.content;
  return (
    <>
      <p className="text-sm text-[var(--pv-ink-faint)]">
        {from(plan)} · started {date(plan.planStart)} · review on {date(plan.reviewDate)}
      </p>
      {c.presentLevels ? (
        <Section title="Where things stand">
          <p className="whitespace-pre-line text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">{c.presentLevels}</p>
        </Section>
      ) : null}
      {c.strengths.length ? (
        <Section title="Strengths">
          <Bullets items={c.strengths} />
        </Section>
      ) : null}
      <Section title="Goals">
        <ol className="flex flex-col gap-3">
          {c.goals.map((g, i) => (
            <li key={g.goalId} className="rounded-xl border border-[var(--pv-border)] p-3">
              <p className="font-semibold text-[var(--pv-ink)]">
                {i + 1}. {g.title}
              </p>
              <p className="mt-1.5 text-[0.95rem] text-[var(--pv-ink)]">
                <span className="font-medium text-[var(--pv-ink-soft)]">Now: </span>
                {g.baseline}
              </p>
              <p className="mt-1 text-[0.95rem] text-[var(--pv-ink)]">
                <span className="font-medium text-[var(--pv-ink-soft)]">Aiming for: </span>
                {g.target}
              </p>
              {g.homePractice.length ? (
                <div className="mt-2 rounded-lg bg-[var(--pv-green-100)] px-3 py-2">
                  <p className="mb-1 text-sm font-semibold text-[var(--pv-green-700)]">Try at home</p>
                  <Bullets items={g.homePractice} />
                </div>
              ) : null}
              {g.strategies.length ? (
                <p className="mt-2 text-sm text-[var(--pv-ink-soft)]">In sessions: {g.strategies.join(" · ")}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </Section>
      {c.notes ? (
        <Section title="Notes">
          <p className="whitespace-pre-line text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">{c.notes}</p>
        </Section>
      ) : null}
    </>
  );
}

/** Every shared plan for this child: the newest in full, older ones on tap. Opening marks unread ones read. */
export function IepPlansView({ token, kidId, kidName, plans, onBack, onRead }: { token: string; kidId: string; kidName: string; plans: IepPlan[]; onBack: () => void; onRead: (p: IepPlan) => void }) {
  const [openId, setOpenId] = useState(plans[0]?.id ?? null);
  useEffect(() => {
    for (const p of plans) if (!p.readAt) void api.markIepPlanRead(token, kidId, p.id).then(onRead).catch(() => {});
    // Only on open: marking read changes `plans`, which mustn't re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-4">
        <button type="button" onClick={onBack} aria-label="Back" className="text-xl text-[var(--pv-ink-soft)]">
          ‹
        </button>
        <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">{kidName}'s plan</p>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-y-auto px-5 py-6">
        {plans.length === 0 ? <p className="text-[var(--pv-ink-faint)]">No plan shared yet. When {kidName}'s therapist shares one, it shows up here.</p> : null}
        {plans.map((p) => (
          <article key={p.id} className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-4">
            <button type="button" onClick={() => setOpenId(openId === p.id ? null : p.id)} className="w-full text-left">
              <h2 className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">{p.title}</h2>
              {openId !== p.id ? <p className="text-sm text-[var(--pv-ink-faint)]">Shared {date(p.sharedAt)} · tap to open</p> : null}
            </button>
            {openId === p.id ? <PlanBody plan={p} /> : null}
          </article>
        ))}
      </main>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { ParentProfile } from "../api/client";

// A compact "Your children" block on the Profile tab. Lists the parent's kids and opens a dialog
// for "Add another child" that collects the same minimal fields as onboarding: first name, date of
// birth, optional therapies and schedule days. On submit the parent profile is refreshed, so the
// new kid appears in the KidSwitcher immediately.

const THERAPIES = ["Speech therapy", "ABA", "Occupational therapy", "Physiotherapy", "Special education", "Other"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Kid = NonNullable<ParentProfile["kids"]>[number];

function toggle<T>(xs: T[], x: T) {
  return xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];
}

function formatDob(dob: string | null) {
  if (!dob) return "";
  try {
    return new Date(dob).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export function ChildrenSection({ token, kids, onChanged }: { token: string; kids: Kid[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <h2 className="mb-2 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">Your children</h2>
      <div className="flex flex-col gap-2 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-4">
        {kids.length === 0 ? <p className="text-sm text-[var(--pv-ink-faint)]">You haven't added a child yet.</p> : null}
        {kids.map((k) => (
          <div key={k.id} className="flex items-baseline justify-between">
            <span className="text-[0.98rem] font-semibold text-[var(--pv-ink)]">{k.firstName}</span>
            {k.dob ? <span className="text-xs text-[var(--pv-ink-faint)]">Born {formatDob(k.dob)}</span> : null}
          </div>
        ))}
        <button type="button" onClick={() => setOpen(true)} className="mt-1 self-start text-[0.98rem] font-semibold text-[var(--pv-green-700)]">
          + Add another child
        </button>
      </div>
      {open ? <AddChildDialog token={token} onClose={() => setOpen(false)} onAdded={() => { setOpen(false); onChanged(); }} /> : null}
    </section>
  );
}

function AddChildDialog({ token, onClose, onAdded }: { token: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<string>("");
  const [therapies, setTherapies] = useState<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const dobIso = new Date(`${dob}T00:00:00`).toISOString();
      const created = await api.createFirstKid(token, { name: name.trim(), dob: dobIso, gender: gender || undefined }) // endpoint handles 1st + additional kids;
      // Optional extras: set in a second call so a validation failure on these doesn't lose the kid.
      if (therapies.length || days.length) {
        try {
          await api.updateKid(token, created.id, {
            ...(therapies.length ? { selfReportedTherapies: therapies } : {}),
            ...(days.length ? { selfReportedScheduleDays: days } : {})
          });
        } catch {
          // The kid is created; the optional fields can be set later from Home nudges.
        }
      }
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add the child. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <form onSubmit={submit} className="flex w-full flex-col gap-3 rounded-t-3xl bg-[var(--pv-surface)] p-5 sm:max-w-md sm:rounded-3xl" aria-label="Add another child">
        <h2 className="text-[1.1rem] font-semibold text-[var(--pv-ink)]">Add another child</h2>
        <p className="text-sm text-[var(--pv-ink-faint)]">You can set up their goals and care team after they're added.</p>
        <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--pv-ink)]">
          Child's name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-2 text-[1rem] font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--pv-ink)]">
          Date of birth
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required max={new Date().toISOString().slice(0, 10)} className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-2 text-[1rem] font-normal" />
        </label>
        <div className="flex flex-col gap-1 text-sm font-semibold text-[var(--pv-ink)]">
          Gender (optional)
          <div className="flex gap-2">
            {["Girl", "Boy", "Other"].map((g) => (
              <button key={g} type="button" onClick={() => setGender(gender === g ? "" : g)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${gender === g ? "border-[var(--pv-green-700)] bg-[var(--pv-green-100)]" : "border-[var(--pv-border)] bg-[var(--pv-surface)]"}`}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-sm font-semibold text-[var(--pv-ink)]">
          Therapies (optional)
          <div className="flex flex-wrap gap-1.5">
            {THERAPIES.map((t) => (
              <button key={t} type="button" onClick={() => setTherapies(toggle(therapies, t))} className={`rounded-full border px-3 py-1.5 text-sm ${therapies.includes(t) ? "border-[var(--pv-green-700)] bg-[var(--pv-green-100)] font-semibold" : "border-[var(--pv-border)] bg-[var(--pv-surface)]"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-sm font-semibold text-[var(--pv-ink)]">
          Therapy days (optional)
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <button key={d} type="button" onClick={() => setDays(toggle(days, d))} className={`rounded-full border px-3 py-1.5 text-sm ${days.includes(d) ? "border-[var(--pv-green-700)] bg-[var(--pv-green-100)] font-semibold" : "border-[var(--pv-border)] bg-[var(--pv-surface)]"}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-[var(--pv-border)] px-5 py-3 text-[0.98rem] font-semibold">
            Cancel
          </button>
          <button type="submit" disabled={busy || !name.trim() || !dob} className="flex-1 rounded-2xl bg-[var(--pv-green-700)] px-5 py-3 text-[0.98rem] font-semibold text-white disabled:opacity-50">
            {busy ? "Adding..." : "Add child"}
          </button>
        </div>
      </form>
    </div>
  );
}

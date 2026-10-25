import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  SCHEDULE_DAYS,
  SCHEDULE_LABELS,
  type LinkedTherapist,
  type ScheduleSlot,
  type TherapistInvitationSummary
} from "../api/client";
import mark from "../brand/mark.svg";
import { ChoiceChip, PrimaryButton, TextField } from "../onboarding/components";

// Care Team and Schedule, the two real sections of what's planned to become a fuller per-kid
// Profile tab. Schedule is recurring weekly slots ("Speech Therapy, every Tuesday 4pm"), not
// dated calendar appointments -- a slot optionally links to one of the therapists already on
// Care Team, since that's the one list of "real" therapists this kid actually has.

const STATUS_LABEL: Record<TherapistInvitationSummary["status"], string> = {
  PENDING: "Invite sent",
  ACCEPTED: "Joined",
  EXPIRED: "Expired",
  REVOKED: "Revoked"
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function TherapistCard({ therapist }: { therapist: LinkedTherapist }) {
  return (
    <div className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3">
      <p className="text-[0.98rem] font-semibold text-[var(--pv-ink)]">{therapist.name}</p>
      <p className="text-[0.82rem] text-[var(--pv-ink-faint)]">{therapist.tenant.name}</p>
    </div>
  );
}

function InvitationCard({ invitation }: { invitation: TherapistInvitationSummary }) {
  const pending = invitation.status === "PENDING";
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[0.95rem] font-medium text-[var(--pv-ink)]">{invitation.email}</p>
        <p className="text-[0.78rem] text-[var(--pv-ink-faint)]">Sent {formatDate(invitation.createdAt)}</p>
      </div>
      <span
        className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
          pending ? "bg-[var(--pv-orange-100)] text-[#8a5a1f]" : "bg-[var(--pv-border)] text-[var(--pv-ink-soft)]"
        }`}
      >
        {STATUS_LABEL[invitation.status]}
      </span>
    </div>
  );
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function ScheduleRow({ slot, onDelete }: { slot: ScheduleSlot; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3">
      <div className="min-w-0">
        <p className="text-[0.95rem] font-semibold text-[var(--pv-ink)]">
          {slot.dayOfWeek} · {formatTime(slot.startTime)}
        </p>
        <p className="text-[0.82rem] text-[var(--pv-ink-faint)]">
          {slot.label}
          {slot.therapist ? ` — ${slot.therapist.name}` : ""}
        </p>
      </div>
      <button type="button" onClick={onDelete} aria-label="Remove slot" className="flex-shrink-0 px-1 text-[1.1rem] text-[var(--pv-ink-faint)] transition hover:text-red-600">
        ×
      </button>
    </div>
  );
}

export function Profile({ token, kidId, kidName, onBack }: { token: string; kidId: string; kidName: string; onBack: () => void }) {
  const [therapists, setTherapists] = useState<LinkedTherapist[] | null>(null);
  const [invitations, setInvitations] = useState<TherapistInvitationSummary[] | null>(null);
  const [schedule, setSchedule] = useState<ScheduleSlot[] | null>(null);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteResult, setInviteResult] = useState("");

  const [newLabel, setNewLabel] = useState<string>(SCHEDULE_LABELS[0]);
  const [newDay, setNewDay] = useState<string>(SCHEDULE_DAYS[0]);
  const [newTime, setNewTime] = useState("16:00");
  const [newTherapistId, setNewTherapistId] = useState("");
  const [addingSlot, setAddingSlot] = useState(false);
  const [slotError, setSlotError] = useState("");

  function refetch() {
    setError("");
    Promise.all([api.listTherapists(token, kidId), api.listTherapistInvitations(token, kidId), api.listSchedule(token, kidId)])
      .then(([t, i, s]) => {
        setTherapists(t);
        setInvitations(i);
        setSchedule(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the care team. Try again."));
  }

  useEffect(() => {
    setTherapists(null);
    setInvitations(null);
    setSchedule(null);
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, kidId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || inviting) return;
    setInviting(true);
    setInviteError("");
    setInviteResult("");
    try {
      const result = await api.inviteTherapist(token, kidId, trimmed);
      setEmail("");
      setInviteResult(
        result.linked
          ? `Found them -- added to ${kidName}'s care team.`
          : `Invite sent to ${trimmed}. They'll get an email to set up their account.`
      );
      refetch();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Couldn't send that invite. Try again.");
    } finally {
      setInviting(false);
    }
  }

  async function handleAddSlot(e: React.FormEvent) {
    e.preventDefault();
    if (addingSlot) return;
    setAddingSlot(true);
    setSlotError("");
    try {
      await api.createScheduleSlot(token, kidId, {
        label: newLabel,
        dayOfWeek: newDay,
        startTime: newTime,
        therapistId: newTherapistId || undefined
      });
      setNewTherapistId("");
      refetch();
    } catch (err) {
      setSlotError(err instanceof ApiError ? err.message : "Couldn't add that slot. Try again.");
    } finally {
      setAddingSlot(false);
    }
  }

  async function handleDeleteSlot(slotId: string) {
    try {
      await api.deleteScheduleSlot(token, kidId, slotId);
      refetch();
    } catch {
      // A failed delete just leaves the slot in place -- the list re-fetches successfully next
      // time regardless, no separate error state needed for a quiet background action like this.
    }
  }

  const pendingInvitations = (invitations ?? []).filter((i) => i.status === "PENDING");

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3.5">
        <button type="button" onClick={onBack} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--pv-ink-soft)] transition hover:bg-[var(--pv-border)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">Profile</p>
      </header>

      <main className="mx-auto w-full min-h-0 max-w-2xl flex-1 overflow-y-auto px-5 py-6">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !therapists || !invitations || !schedule ? (
          <div className="flex justify-center py-10">
            <img src={mark} alt="" className="h-8 w-8 animate-pulse opacity-60" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <section>
              <h2 className="mb-2 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">Care team</h2>

              {therapists.length === 0 && pendingInvitations.length === 0 ? (
                <p className="text-sm text-[var(--pv-ink-faint)]">
                  No one's linked to {kidName}'s care team yet -- invite their therapist below.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {therapists.map((t) => (
                    <TherapistCard key={t.id} therapist={t} />
                  ))}
                  {pendingInvitations.map((i) => (
                    <InvitationCard key={i.id} invitation={i} />
                  ))}
                </div>
              )}

              <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-3 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-4">
                <TextField
                  id="therapistEmail"
                  label="Invite a therapist"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="their.email@example.com"
                />
                {inviteError ? <p className="text-sm text-red-600">{inviteError}</p> : null}
                {inviteResult ? <p className="text-sm text-[var(--pv-green-700)]">{inviteResult}</p> : null}
                <PrimaryButton type="submit" disabled={inviting || !email.trim()}>
                  {inviting ? "Sending..." : "Invite"}
                </PrimaryButton>
              </form>
            </section>

            <section>
              <h2 className="mb-2 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">Schedule</h2>

              {schedule.length === 0 ? (
                <p className="text-sm text-[var(--pv-ink-faint)]">Nothing on {kidName}'s schedule yet -- add a weekly slot below.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {schedule.map((s) => (
                    <ScheduleRow key={s.id} slot={s} onDelete={() => handleDeleteSlot(s.id)} />
                  ))}
                </div>
              )}

              <form onSubmit={handleAddSlot} className="mt-4 flex flex-col gap-3 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-4">
                <div>
                  <span className="mb-1.5 block text-[0.95rem] font-medium text-[var(--pv-ink-soft)]">What</span>
                  <div className="flex flex-wrap gap-2">
                    {SCHEDULE_LABELS.map((l) => (
                      <ChoiceChip key={l} label={l} selected={newLabel === l} onClick={() => setNewLabel(l)} />
                    ))}
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block text-[0.95rem] font-medium text-[var(--pv-ink-soft)]">Day</span>
                  <div className="flex flex-wrap gap-2">
                    {SCHEDULE_DAYS.map((d) => (
                      <ChoiceChip key={d} label={d} selected={newDay === d} onClick={() => setNewDay(d)} />
                    ))}
                  </div>
                </div>

                <TextField id="slotTime" label="Time" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />

                {therapists.length > 0 ? (
                  <label className="block">
                    <span className="mb-1.5 block text-[0.95rem] font-medium text-[var(--pv-ink-soft)]">Therapist (optional)</span>
                    <select
                      value={newTherapistId}
                      onChange={(e) => setNewTherapistId(e.target.value)}
                      className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3 text-[1.05rem] text-[var(--pv-ink)] outline-none transition focus:border-[var(--pv-green-500)] focus:ring-2 focus:ring-[var(--pv-green-100)]"
                    >
                      <option value="">No therapist linked</option>
                      {therapists.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {slotError ? <p className="text-sm text-red-600">{slotError}</p> : null}
                <PrimaryButton type="submit" disabled={addingSlot}>
                  {addingSlot ? "Adding..." : "Add to schedule"}
                </PrimaryButton>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

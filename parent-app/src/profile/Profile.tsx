import { useEffect, useState } from "react";
import { api, ApiError, type LinkedTherapist, type TherapistInvitationSummary } from "../api/client";
import mark from "../brand/mark.svg";
import { PrimaryButton, TextField } from "../onboarding/components";

// First real section of what's planned to become a fuller per-kid Profile tab -- Care Team now,
// a Schedule section later once there's an actual schedule/appointment model to back it (none
// exists in the database yet, so that section below is a placeholder, not a stub screen).

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

export function Profile({ token, kidId, kidName, onBack }: { token: string; kidId: string; kidName: string; onBack: () => void }) {
  const [therapists, setTherapists] = useState<LinkedTherapist[] | null>(null);
  const [invitations, setInvitations] = useState<TherapistInvitationSummary[] | null>(null);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteResult, setInviteResult] = useState("");

  function refetch() {
    setError("");
    Promise.all([api.listTherapists(token, kidId), api.listTherapistInvitations(token, kidId)])
      .then(([t, i]) => {
        setTherapists(t);
        setInvitations(i);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the care team. Try again."));
  }

  useEffect(() => {
    setTherapists(null);
    setInvitations(null);
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
        ) : !therapists || !invitations ? (
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
              <div className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-5 text-center">
                <p className="text-sm text-[var(--pv-ink-faint)]">Coming soon.</p>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

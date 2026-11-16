import { useState, type FormEvent } from "react";
import { api, apiUrl, ApiError } from "../api/client";
import { PrimaryButton, StepHeading, TextField } from "../onboarding/components";
import { AuthShell } from "../auth/AuthShell";

function day(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/** What deleting does -- shown before confirming, and on the public /delete-account page. */
export function WhatDeletionDoes() {
  return (
    <div className="flex flex-col gap-2 text-[0.95rem] leading-relaxed text-[var(--pv-ink-soft)]">
      <p>
        <strong className="text-[var(--pv-ink)]">You have 30 days to change your mind.</strong> Your account stays as it is until then. Sign in and tap "Keep my account" to cancel.
      </p>
      <p>After 30 days we delete:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>your account: email, name, phone, address and password</li>
        <li>for a child you added yourself: everything about them (goals, entries, messages and schedule)</li>
        <li>your conversations with Pravnya and the schedule you kept, for every child</li>
      </ul>
      <p>
        If your child's centre added them to Pravnya, the centre keeps its own therapy records (goals, session entries, updates and plans it wrote). Ask the centre if you want those deleted too.
      </p>
      <p>You can download a copy of your data first.</p>
    </div>
  );
}

/** Shown on Home while the account is waiting to be deleted. */
export function DeletionBanner({ token, scheduledPurgeAt, onChanged }: { token: string; scheduledPurgeAt: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function keep() {
    setBusy(true);
    setError("");
    try {
      await api.cancelAccountDeletion(token);
      onChanged();
    } catch {
      setError("Couldn't cancel. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4">
      <p className="text-[0.98rem] text-[var(--pv-ink)]">Your account will be deleted on {day(scheduledPurgeAt)}.</p>
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
      <button type="button" onClick={keep} disabled={busy} className="mt-2 text-[0.95rem] font-semibold text-[var(--pv-green-700)]">
        {busy ? "Keeping..." : "Keep my account"}
      </button>
    </div>
  );
}

/** "Your account" on the Profile tab: download my data, delete my account. */
export function AccountSection({ token, email, scheduledPurgeAt, onChanged }: { token: string; email: string; scheduledPurgeAt: string | null; onChanged: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setError("");
    setDownloading(true);
    try {
      const { path } = await api.dataExportLink(token);
      // A plain navigation: the server answers with a file download, so the page stays put. In the
      // Android app, a link to the API's own address opens in the phone's browser, which saves it.
      window.location.assign(apiUrl(path));
    } catch {
      setError("Couldn't prepare your data. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function confirmDelete(e: FormEvent) {
    e.preventDefault();
    setError("");
    setDeleting(true);
    try {
      await api.requestAccountDeletion(token, password);
      setConfirming(false);
      setPassword("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete your account. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section id="account">
      <h2 className="mb-2 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">Your account</h2>
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-4">
        <p className="text-sm text-[var(--pv-ink-faint)]">Signed in as {email}</p>
        <button type="button" onClick={download} disabled={downloading} className="text-left text-[0.98rem] font-semibold text-[var(--pv-green-700)]">
          {downloading ? "Preparing your data..." : "Download my data"}
        </button>
        {error && !confirming ? <p className="text-sm text-red-600">{error}</p> : null}

        {scheduledPurgeAt ? (
          <DeletionBanner token={token} scheduledPurgeAt={scheduledPurgeAt} onChanged={onChanged} />
        ) : confirming ? (
          <form onSubmit={confirmDelete} className="flex flex-col gap-3 border-t border-[var(--pv-border)] pt-3">
            <p className="font-semibold text-[var(--pv-ink)]">Delete your account?</p>
            <WhatDeletionDoes />
            <TextField id="deletePassword" label="Enter your password to confirm" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={deleting || !password}
              className="w-full rounded-2xl bg-red-600 px-5 py-3.5 text-[1.05rem] font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-[var(--pv-border)] disabled:text-[var(--pv-ink-faint)]"
            >
              {deleting ? "Deleting..." : "Delete my account"}
            </button>
            <button type="button" onClick={() => { setConfirming(false); setError(""); }} className="text-[0.9rem] font-medium text-[var(--pv-ink-faint)]">
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="text-left text-[0.98rem] font-semibold text-red-600">
            Delete my account
          </button>
        )}
      </div>
    </section>
  );
}

/** The public page at /delete-account (the link Google Play shows): explains, then asks to sign in. */
export function DeleteAccountInfo({ onSignIn, onBack }: { onSignIn: () => void; onBack: () => void }) {
  return (
    <AuthShell onBack={onBack}>
      <div className="flex flex-col gap-5">
        <StepHeading title="Delete your Pravnya account" />
        <p className="text-[0.98rem] text-[var(--pv-ink-soft)]">Sign in, then go to Profile → Your account → Delete my account. We'll take you straight there.</p>
        <WhatDeletionDoes />
        <PrimaryButton type="button" onClick={onSignIn}>
          Sign in to delete
        </PrimaryButton>
      </div>
    </AuthShell>
  );
}

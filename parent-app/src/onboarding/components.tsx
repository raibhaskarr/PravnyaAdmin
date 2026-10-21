import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-[1.6rem] font-semibold leading-snug text-[var(--pv-ink)] text-balance">{title}</h1>
      {subtitle ? <p className="mt-2 text-[1.05rem] leading-relaxed text-[var(--pv-ink-soft)]">{subtitle}</p> : null}
    </div>
  );
}

export function PrimaryButton({ children, ...props }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full rounded-2xl bg-[var(--pv-green-700)] px-5 py-3.5 text-[1.05rem] font-semibold text-white transition active:bg-[var(--pv-green-900)] disabled:cursor-not-allowed disabled:bg-[var(--pv-border)] disabled:text-[var(--pv-ink-faint)]"
    >
      {children}
    </button>
  );
}

export function SkipLink({ onClick, label = "Skip for now" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 w-full text-center text-[0.95rem] font-medium text-[var(--pv-ink-faint)] underline-offset-4 transition hover:text-[var(--pv-ink-soft)] hover:underline"
    >
      {label}
    </button>
  );
}

export function TextField(props: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, id, ...rest } = props;
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-[0.95rem] font-medium text-[var(--pv-ink-soft)]">{label}</span>
      <input
        id={id}
        {...rest}
        className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3 text-[1.05rem] text-[var(--pv-ink)] outline-none transition focus:border-[var(--pv-green-500)] focus:ring-2 focus:ring-[var(--pv-green-100)]"
      />
    </label>
  );
}

export function ChoiceChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-2.5 text-[0.95rem] font-medium transition ${
        selected
          ? "border-[var(--pv-green-500)] bg-[var(--pv-green-100)] text-[var(--pv-green-900)]"
          : "border-[var(--pv-border)] bg-[var(--pv-surface)] text-[var(--pv-ink-soft)] hover:border-[var(--pv-green-500)]"
      }`}
    >
      {label}
    </button>
  );
}

interface Props {
  /** Mobile skeleton content. Rendered as-is on <lg, hidden on lg+. */
  children: React.ReactNode;
}

/**
 * Suspense-fallback wrapper used by every route-level `loading.tsx`.
 * Splits the loading visual by viewport:
 *   - mobile (<lg): renders the existing skeleton placeholders so the
 *     phone UX still feels app-like during navigation.
 *   - desktop (lg+): renders a centered gold spinner instead — phone-
 *     shaped skeleton boxes don't tile the desktop layout cleanly, so
 *     a single spinner reads as a cleaner "page is coming" cue.
 */
export function RouteLoading({ children }: Props) {
  return (
    <>
      <div className="lg:hidden">{children}</div>
      <div
        className="hidden lg:flex items-center justify-center min-h-[70vh]"
        role="status"
        aria-label="Chargement"
      >
        <span className="relative flex h-14 w-14">
          <span className="absolute inset-0 rounded-full border-[3px] border-[var(--border)]" />
          <span className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[var(--gold)] border-r-[var(--gold-bright)] animate-spin" />
        </span>
      </div>
    </>
  );
}

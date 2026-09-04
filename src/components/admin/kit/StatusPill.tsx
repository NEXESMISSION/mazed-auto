import { statusLabel, statusTone, TONE_CLASS, type Tone } from "./tones";

/**
 * The console's one pill. Two ways in:
 *
 *   <StatusPill status={listing.status} />     — looks up label + tone
 *   <StatusPill tone="warn">3 en retard</StatusPill>  — free text, chosen tone
 *
 * `StatusBadge` (the old one) took a tone and a label and left every caller
 * to decide both, which is how "published" ended up green here and gold
 * there. Passing the raw DB status is the path of least resistance now.
 */
export function StatusPill({
  status,
  tone,
  icon,
  size = "sm",
  children,
  className = "",
}: {
  /** Raw DB value — `published`, `pending_review`, `captured`… */
  status?: string | null;
  /** Overrides the tone derived from `status`. Required when there is no status. */
  tone?: Tone;
  icon?: React.ReactNode;
  size?: "xs" | "sm";
  children?: React.ReactNode;
  className?: string;
}) {
  const resolved: Tone = tone ?? statusTone(status);
  const label = children ?? statusLabel(status);
  const dims =
    size === "xs"
      ? "px-1.5 py-0.5 text-[9px] tracking-[0.1em]"
      : "px-2 py-0.5 text-[10px] tracking-[0.11em]";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md font-bold uppercase ring-1 ${dims} ${TONE_CLASS[resolved]} ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

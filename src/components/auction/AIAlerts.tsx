import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import type { AIAlert } from "@/lib/types";

interface Props {
  alerts: AIAlert[];
}

/**
 * Inline auction alerts. We dropped the "AI notes" framing — users just
 * want practical heads-ups (under-market price, low photo count, new seller,
 * etc.) without the technical baggage. Renders as a clean stack of compact
 * tip rows with a small leading icon, no card chrome.
 */
export function AIAlerts({ alerts }: Props) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {alerts.map((alert, i) => {
        const isWarn = alert.type === "warning";
        const Icon = isWarn ? AlertTriangle : Info;
        return (
          <li
            key={i}
            className={`flex gap-2.5 p-3 rounded-xl border ${
              isWarn
                ? "bg-amber-500/[0.06] border-amber-500/25"
                : "bg-[var(--surface)] border-[var(--border)]"
            }`}
          >
            <span
              className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center mt-0.5 ${
                isWarn
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[13px] leading-tight">
                {alert.title}
              </div>
              {alert.detail && (
                <div className="text-[12px] text-[var(--foreground-muted)] mt-1 leading-relaxed">
                  {alert.detail}
                </div>
              )}
              {alert.suggestion && (
                <div className="mt-2 inline-flex items-start gap-1.5 text-[12px] text-[var(--gold)]">
                  <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{alert.suggestion}</span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

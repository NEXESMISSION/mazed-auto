import {
  Gavel,
  Plus,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Ban,
  Power,
  Activity,
} from "lucide-react";
import type { UserActivityEntry } from "@/lib/db";

interface Props {
  entries: UserActivityEntry[];
}

const KIND_LABEL: Record<string, string> = {
  auction_created: "Enchère publiée",
  bid_placed: "Offre déposée",
  kyc_submitted: "Dossier KYC soumis",
  kyc_approved: "Dossier KYC accepté",
  kyc_rejected: "Dossier KYC refusé",
  kyc_updated: "Dossier KYC modifié",
  account_deactivated: "Compte désactivé",
  account_reactivated: "Compte réactivé",
};

function iconFor(kind: string) {
  switch (kind) {
    case "auction_created":
      return Plus;
    case "bid_placed":
      return Gavel;
    case "kyc_submitted":
    case "kyc_updated":
      return ShieldAlert;
    case "kyc_approved":
      return ShieldCheck;
    case "kyc_rejected":
      return ShieldX;
    case "account_deactivated":
      return Ban;
    case "account_reactivated":
      return Power;
    default:
      return Activity;
  }
}

function toneFor(kind: string): "gold" | "success" | "warning" | "danger" | "muted" {
  if (kind === "auction_created" || kind === "bid_placed") return "gold";
  if (kind === "kyc_approved" || kind === "account_reactivated") return "success";
  if (kind === "kyc_submitted" || kind === "kyc_updated") return "warning";
  if (kind === "kyc_rejected" || kind === "account_deactivated") return "danger";
  return "muted";
}

const TONE_CLASSES: Record<string, string> = {
  gold: "bg-[var(--gold-faint)] text-[var(--gold)] border border-[var(--gold)]/30",
  success: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-300 border border-amber-500/30",
  danger: "bg-red-500/10 text-red-300 border border-red-500/30",
  muted: "bg-[var(--surface-2)] text-[var(--foreground-muted)] border border-[var(--border)]",
};

export function ActivityLog({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[var(--foreground-muted)] py-4 text-center">
        Aucune activité enregistrée
      </p>
    );
  }
  return (
    <ol className="relative pl-5 space-y-4">
      <span
        aria-hidden
        className="absolute top-2 bottom-2 left-[7px] w-px bg-[var(--border)]"
      />
      {entries.map((e) => {
        const Icon = iconFor(e.kind);
        const tone = toneFor(e.kind);
        return (
          <li key={e.id} className="relative flex gap-3">
            <span
              className={`absolute -left-5 mt-0.5 h-4 w-4 rounded-full ${TONE_CLASSES[tone]} flex items-center justify-center`}
            >
              <Icon className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">
                {KIND_LABEL[e.kind] ?? e.kind}
              </div>
              {e.detail && (
                <div className="text-xs text-[var(--foreground-muted)] mt-0.5 truncate">
                  {e.detail}
                </div>
              )}
              <div className="text-[10px] text-[var(--foreground-subtle)] mt-1 tabular-nums">
                {new Date(e.created_at).toLocaleString("fr-FR")}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

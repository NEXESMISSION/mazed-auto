"use client";

import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  AlertTriangle,
  Check,
  X,
  ArrowUpRight,
  Ban,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { listReports, type ReportRow } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import {
  forceCancelAuctionAction,
  banUserAction,
} from "@/app/[locale]/admin/actions";

const reasonLabels: Record<string, string> = {
  wrong_info: "Informations incorrectes",
  images_mismatch: "Les photos ne correspondent pas à la voiture",
  off_platform: "Le vendeur demande un paiement hors plateforme",
  hidden_defects: "La voiture a des défauts non mentionnés",
  fraud_suspicion: "Suspicion de fraude",
  suspicious_price: "Prix suspect (très bas)",
  disputed_ownership: "Propriété contestée",
};

export function ReportsList({ initial }: { initial: ReportRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [reports, setReports] = useState<ReportRow[]>(initial);

  async function escalateCancel(r: ReportRow) {
    if (!r.auction_id) return;
    const reason = window.prompt(
      `Annuler l'enchère et rembourser toutes les cautions ?\nRaison (audit) :`,
      reasonLabels[r.reason] ?? r.reason,
    );
    if (!reason || !reason.trim()) return;
    const res = await forceCancelAuctionAction({
      auctionId: r.auction_id,
      reason: reason.trim(),
    });
    if (!res.ok) {
      toast("Échec : " + res.error, "error");
      return;
    }
    // Mark report resolved as part of the escalation.
    const supabase = createClient();
    await supabase
      .from("reports")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", r.id);
    setReports((prev) => prev.filter((x) => x.id !== r.id));
    toast("Enchère annulée et signalement résolu", "warning");
    router.refresh();
  }

  async function escalateBan(r: ReportRow) {
    const sellerId = r.auction?.seller_id;
    if (!sellerId) {
      toast("ID vendeur introuvable", "error");
      return;
    }
    const reason = window.prompt(
      `Suspendre le vendeur (durée 30 jours) ?\nRaison (audit) :`,
      "Suite au signalement : " + (reasonLabels[r.reason] ?? r.reason),
    );
    if (!reason || !reason.trim()) return;
    const res = await banUserAction({
      userId: sellerId,
      reason: reason.trim(),
      scope: "full",
      durationDays: 30,
    });
    if (!res.ok) {
      toast("Échec : " + res.error, "error");
      return;
    }
    const supabase = createClient();
    await supabase
      .from("reports")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", r.id);
    setReports((prev) => prev.filter((x) => x.id !== r.id));
    toast("Vendeur suspendu 30 jours et signalement résolu", "warning");
    router.refresh();
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-reports")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reports" },
        () => {
          listReports(supabase, ["open", "reviewing"]).then(setReports);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function setStatus(id: string, status: ReportRow["status"]) {
    const supabase = createClient();
    const patch =
      status === "resolved" || status === "dismissed"
        ? { status, resolved_at: new Date().toISOString() }
        : { status };
    const { error } = await supabase.from("reports").update(patch).eq("id", id);
    if (error) {
      toast("Échec de la mise à jour", "error");
      return;
    }
    setReports((prev) => prev.filter((r) => r.id !== id));
    toast(
      status === "resolved"
        ? "Signalement résolu"
        : status === "dismissed"
          ? "Signalement refusé"
          : "Signalement passé en cours d'examen",
      "success",
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((r) => {
        const v = r.auction;
        const auctionTitle = v
          ? `${v.make} ${v.model} ${v.year} — ${formatPrice(Number(v.current_price))}`
          : "Enchère supprimée";
        return (
          <div
            key={r.id}
            className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex gap-3 min-w-0">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                    r.severity === "high"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-amber-500/15 text-amber-400"
                  }`}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm line-clamp-1">
                    {auctionTitle}
                  </div>
                  <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    {reasonLabels[r.reason] ?? r.reason}
                  </div>
                  {r.detail && (
                    <p className="text-xs text-[var(--foreground-subtle)] mt-1 line-clamp-2">
                      &ldquo;{r.detail}&rdquo;
                    </p>
                  )}
                  <div className="text-[10px] text-[var(--foreground-subtle)] mt-1">
                    Par {r.reporter_label || "utilisateur"} •{" "}
                    {formatRel(r.created_at)}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge
                  variant={r.severity === "high" ? "danger" : "warning"}
                  size="sm"
                >
                  {r.severity === "high" ? "Critique" : "Moyen"}
                </Badge>
                {r.status === "reviewing" && (
                  <Badge variant="gold" size="sm">
                    En cours de modération
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {r.auction_id && (
                <Link href={`/auctions/${r.auction_id}`}>
                  <Button size="sm" variant="ghost">
                    <ArrowUpRight className="h-4 w-4" />
Voir l'enchère
                  </Button>
                </Link>
              )}
              {r.status === "open" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setStatus(r.id, "reviewing")}
                >
Commencer l'examen
                </Button>
              )}
              <Button size="sm" onClick={() => setStatus(r.id, "resolved")}>
                <Check className="h-4 w-4" />
Résoudre le signalement
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setStatus(r.id, "dismissed")}
              >
                <X className="h-4 w-4" />
                Refuser
              </Button>
              {r.auction_id && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => escalateCancel(r)}
                >
                  <Ban className="h-4 w-4" />
                  Annuler l'enchère
                </Button>
              )}
              {r.auction?.seller_id && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => escalateBan(r)}
                >
                  <ShieldAlert className="h-4 w-4" />
                  Suspendre vendeur
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatRel(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `Il y a ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Il y a ${hr} h`;
  const days = Math.floor(hr / 24);
  return `Il y a ${days} ${days === 1 ? "jour" : "jours"}`;
}

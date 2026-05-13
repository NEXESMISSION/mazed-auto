import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import {
  ChevronLeft,
  Gavel,
  Trophy,
  TrendingDown,
  ShieldCheck,
  Wallet,
  AlertTriangle,
  Bell,
  Clock,
  CheckCircle2,
  CreditCard,
  Star,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { MarkRead } from "./MarkRead";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Notification detail page. Tapping a row in the list lands here so
 * the user reads the FULL message (title + body + when + an action
 * CTA pointing at the related auction or admin queue) before they
 * navigate away. Auto-marks the notification as read via the inline
 * MarkRead client component once the page mounts.
 */
interface Props {
  params: Promise<{ id: string; locale: string }>;
}

export default async function NotificationDetail({ params }: Props) {
  const { id, locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?redirect=/notifications/${id}`);
  }

  const { data: n } = await supabase
    .from("notifications")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id) // RLS already enforces this; belt-and-suspenders
    .maybeSingle();
  if (!n) notFound();

  // Map kind → icon, tint, and "what to do next" link. Keep in sync
  // with NotificationsList.kindMeta — same vocabulary on both pages.
  const meta = KIND_META[n.kind as keyof typeof KIND_META] ?? KIND_META.system;
  const Icon = meta.icon;
  const actionHref = meta.href(n);

  return (
    <AppShell noTopBar>
      <ScreenHeader title="Notification" backHref="/notifications" />
      <MarkRead id={n.id} alreadyRead={n.is_read} />

      <div className="max-w-2xl mx-auto px-4 py-5 lg:py-10 space-y-5">
        {/* Hero — icon chip + title + when */}
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5 lg:p-7 space-y-4">
          <div className="flex items-start gap-4">
            <div
              className={`shrink-0 h-14 w-14 rounded-2xl flex items-center justify-center ${meta.color}`}
            >
              <Icon className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--foreground-muted)]">
                {meta.label}
              </div>
              <h1 className="mt-1 text-xl lg:text-2xl font-black tracking-tight leading-tight">
                {n.title}
              </h1>
            </div>
          </div>

          {n.body && (
            <p className="text-[15px] text-foreground/90 leading-relaxed whitespace-pre-line">
              {n.body}
            </p>
          )}

          <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)] text-xs text-[var(--foreground-muted)]">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {formatDateTime(new Date(n.created_at), locale, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </div>
        </div>

        {/* Action CTA — links to the relevant auction / queue */}
        {actionHref && (
          <Link href={actionHref} className="block">
            <Button size="lg" fullWidth>
              {meta.cta}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}

        <Link
          href="/notifications"
          className="block text-center text-xs text-[var(--foreground-muted)] hover:text-[var(--gold)]"
        >
          ← Toutes mes notifications
        </Link>
      </div>
    </AppShell>
  );
}

// ── kind → presentation + CTA. Mirrors NotificationsList.kindMeta ──

interface KindEntry {
  icon: LucideIcon;
  color: string;
  label: string;
  cta: string;
  href: (n: { auction_id: string | null; kind: string }) => string | null;
}

const KIND_META: Record<string, KindEntry> = {
  outbid: {
    icon: TrendingDown,
    color: "bg-amber-500/15 text-amber-300",
    label: "Vous avez été dépassé",
    cta: "Voir l'enchère",
    href: (n) => (n.auction_id ? `/auctions/${n.auction_id}` : "/buyer/bids"),
  },
  won: {
    icon: Trophy,
    color: "bg-[var(--gold-faint)] text-[var(--gold)]",
    label: "Enchère gagnée",
    cta: "Voir mes gains",
    href: () => "/buyer/bids?tab=won",
  },
  lost: {
    icon: AlertTriangle,
    color: "bg-red-500/15 text-red-300",
    label: "Enchère perdue",
    cta: "Voir mes enchères",
    href: () => "/buyer/bids",
  },
  new_bid: {
    icon: Gavel,
    color: "bg-[var(--gold-faint)] text-[var(--gold)]",
    label: "Nouvelle offre sur votre enchère",
    cta: "Voir l'enchère",
    href: (n) =>
      n.auction_id ? `/auctions/${n.auction_id}` : "/seller/auctions",
  },
  approved: {
    icon: CheckCircle2,
    color: "bg-emerald-500/15 text-emerald-300",
    label: "Approuvée",
    cta: "Voir le détail",
    href: (n) =>
      n.auction_id ? `/auctions/${n.auction_id}` : "/seller/auctions",
  },
  rejected: {
    icon: AlertTriangle,
    color: "bg-red-500/15 text-red-300",
    label: "Refusée",
    cta: "Voir le détail",
    href: (n) =>
      n.auction_id ? `/seller/auctions/${n.auction_id}` : "/seller/auctions",
  },
  kyc_approved: {
    icon: ShieldCheck,
    color: "bg-emerald-500/15 text-emerald-300",
    label: "Identité vérifiée",
    cta: "Voir mon profil",
    href: () => "/profile",
  },
  kyc_rejected: {
    icon: ShieldCheck,
    color: "bg-red-500/15 text-red-300",
    label: "Vérification refusée",
    cta: "Reprendre la vérification",
    href: () => "/kyc/status",
  },
  payment_received: {
    icon: Wallet,
    color: "bg-emerald-500/15 text-emerald-300",
    label: "Paiement reçu",
    cta: "Voir mes transactions",
    href: () => "/transactions",
  },
  reminder: {
    icon: Clock,
    color: "bg-[var(--gold-faint)] text-[var(--gold)]",
    label: "Rappel",
    cta: "Voir l'enchère",
    href: (n) => (n.auction_id ? `/auctions/${n.auction_id}` : null),
  },
  deposit_refunded: {
    icon: CreditCard,
    color: "bg-emerald-500/15 text-emerald-300",
    label: "Caution remboursée",
    cta: "Voir mes transactions",
    href: () => "/transactions",
  },
  forfeited: {
    icon: AlertTriangle,
    color: "bg-red-500/15 text-red-300",
    label: "Caution retenue",
    cta: "Voir mes transactions",
    href: () => "/transactions",
  },
  reserve_not_met: {
    icon: AlertTriangle,
    color: "bg-amber-500/15 text-amber-300",
    label: "Réserve non atteinte",
    cta: "Voir l'enchère",
    href: (n) =>
      n.auction_id ? `/auctions/${n.auction_id}` : "/seller/auctions",
  },
  auction_extended: {
    icon: Clock,
    color: "bg-[var(--gold-faint)] text-[var(--gold)]",
    label: "Enchère prolongée",
    cta: "Voir l'enchère",
    href: (n) => (n.auction_id ? `/auctions/${n.auction_id}` : null),
  },
  new_report: {
    icon: AlertTriangle,
    color: "bg-amber-500/15 text-amber-300",
    label: "Nouveau signalement",
    cta: "Voir le signalement",
    href: () => "/admin/reports",
  },
  rating_request: {
    icon: Star,
    color: "bg-[var(--gold-faint)] text-[var(--gold)]",
    label: "Évaluation demandée",
    cta: "Évaluer le vendeur",
    href: (n) =>
      n.auction_id ? `/auctions/${n.auction_id}` : "/buyer/bids?tab=won",
  },
  system: {
    icon: Bell,
    color: "bg-[var(--surface-2)] text-[var(--foreground-muted)]",
    label: "Information",
    cta: "Voir mon compte",
    href: () => "/profile",
  },
};

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { CheckCircle2, ShieldCheck, Clock, RefreshCw } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

export default function KYCStatusPage() {
  const { user, loaded } = useAuth();
  const router = useRouter();
  const t = useTranslations("kyc.status");
  const [refreshing, setRefreshing] = useState(false);

  // Default to "pending" while the user object is hydrating — the user
  // just submitted, so showing them the waiting screen is the right
  // optimistic guess.
  const status = loaded ? user?.kycStatus ?? "pending" : "pending";

  // Force-refresh the auth session on mount and periodically. The KYC
  // status lives in user_metadata, which Supabase only re-syncs to the
  // client JWT when the session refreshes. Without this, an admin
  // approval lands in the DB but the user keeps seeing "pending" on
  // this page until they sign out and back in.
  useEffect(() => {
    if (!loaded) return;
    if (status === "verified") return; // nothing to wait for
    const supabase = createClient();
    let cancelled = false;

    async function refresh() {
      if (cancelled) return;
      try {
        await supabase.auth.refreshSession();
      } catch {
        // ignore — auth state subscription will pick up next time
      }
    }

    // First refresh on mount.
    refresh();
    // Poll every 15s so a freshly-approved user sees the green state
    // without having to manually hit "Re-vérifier".
    const id = setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [loaded, status]);

  async function manualRefresh() {
    setRefreshing(true);
    try {
      const supabase = createClient();
      await supabase.auth.refreshSession();
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  if (status === "rejected") {
    return (
      <KYCShell current={3}>
        <div className="space-y-6 py-8 text-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-red-500/15 flex items-center justify-center">
            <span className="text-4xl">✗</span>
          </div>
          <div>
            <h2 className="text-xl font-bold">{t("rejectedTitle")}</h2>
            <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
              {t("rejectedBody")}
            </p>
          </div>
          <div className="space-y-2">
            <Link href="/kyc/start">
              <Button size="lg" fullWidth>
                {t("rejectedRetryCta")}
              </Button>
            </Link>
            <Link href="/help">
              <Button size="lg" variant="ghost" fullWidth>
                {t("rejectedSupportCta")}
              </Button>
            </Link>
          </div>
        </div>
      </KYCShell>
    );
  }

  if (status === "verified") {
    return (
      <KYCShell current={3}>
        <div className="space-y-6 py-6 text-center">
          <div className="relative mx-auto h-24 w-24">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(74,222,128,0.4), transparent)",
              }}
            />
            <div className="relative h-full w-full rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_50px_rgba(74,222,128,0.5)]">
              <CheckCircle2
                className="h-12 w-12 text-white"
                strokeWidth={2.5}
              />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-extrabold">{t("verifiedTitle")}</h2>
            <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
              {t("verifiedBody")}
            </p>
          </div>

          <div className="rounded-[var(--radius-md)] bg-[var(--gold-faint)] border border-[var(--gold-soft)]/40 p-4">
            <div className="flex items-center justify-center gap-2 text-[var(--gold)] font-bold mb-1">
              <ShieldCheck className="h-5 w-5" />
              {t("verifiedBadge")}
            </div>
            <div className="text-xs text-[var(--foreground-muted)]">
              {t("verifiedBadgeHint")}
            </div>
          </div>

          <div className="space-y-2">
            <Link href="/seller/dashboard">
              <Button size="lg" fullWidth>
                {t("startSellerCta")}
              </Button>
            </Link>
            <Link href="/auctions">
              <Button size="lg" variant="ghost" fullWidth>
                {t("browseAuctionsCta")}
              </Button>
            </Link>
          </div>
        </div>
      </KYCShell>
    );
  }

  // pending — what every user sees right after submitting. Admin reviews
  // the photos + selfie video manually.
  return (
    <KYCShell current={3}>
      <div className="space-y-6 py-8 text-center">
        <div className="relative mx-auto h-24 w-24">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(212,175,55,0.35), transparent)",
            }}
          />
          <div className="relative h-full w-full rounded-full bg-[var(--gold-faint)] border-2 border-[var(--gold)] flex items-center justify-center">
            <Clock className="h-11 w-11 text-[var(--gold)]" strokeWidth={2} />
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-extrabold">{t("pendingTitle")}</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
            {t("pendingBody")}
          </p>
        </div>

        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 text-start space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-[var(--gold)] shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-bold">{t("delayTitle")}</div>
              <div className="text-xs text-[var(--foreground-muted)] mt-0.5 leading-relaxed">
                {t("delayBody")}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-[var(--gold)] shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-bold">{t("noAccessTitle")}</div>
              <div className="text-xs text-[var(--foreground-muted)] mt-0.5 leading-relaxed">
                {t("noAccessBody")}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Button
            size="lg"
            fullWidth
            onClick={manualRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? t("refreshing") : t("refreshCta")}
          </Button>
          <Link href="/auctions">
            <Button size="lg" variant="secondary" fullWidth>
              {t("browseCta")}
            </Button>
          </Link>
          <Link href="/">
            <Button size="lg" variant="ghost" fullWidth>
              {t("homeCta")}
            </Button>
          </Link>
        </div>
      </div>
    </KYCShell>
  );
}

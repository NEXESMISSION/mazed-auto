import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  Hourglass,
  ArrowRight,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * KYC gate for the entire auction-creation wizard. PLAN §10/§11 — only
 * verified sellers may publish. We block access at the layout level so users
 * can't slip into a later step by URL.
 */
export default async function NewAuctionGateLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect({ href: "/login?redirect=/seller/new/step-1", locale });
  }

  const meta = (user.user_metadata ?? {}) as {
    kycStatus?: "none" | "pending" | "verified" | "rejected";
  };
  const status = meta.kycStatus ?? "none";

  if (status === "verified") {
    return <>{children}</>;
  }

  // Anything else: render a blocker page in place of the wizard. Clear what
  // the user has to do, with one obvious next step.
  const t = await getTranslations({ locale, namespace: "wizard.kycBlock" });
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 max-w-md mx-auto w-full px-4 py-10 flex flex-col justify-center">
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-6 text-center space-y-5">
          {status === "pending" ? (
            <>
              <div className="mx-auto h-16 w-16 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <Hourglass className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold">{t("pendingTitle")}</h1>
                <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
                  {t("pendingBody")}
                </p>
              </div>
              <Link href="/kyc/status" className="block">
                <Button variant="secondary" size="md" fullWidth>
                  {t("pendingCta")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </>
          ) : status === "rejected" ? (
            <>
              <div className="mx-auto h-16 w-16 rounded-full bg-red-500/15 text-[var(--danger)] flex items-center justify-center">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold">{t("rejectedTitle")}</h1>
                <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
                  {t("rejectedBody")}
                </p>
              </div>
              <Link href="/kyc/start" className="block">
                <Button size="md" fullWidth>
                  {t("rejectedCta")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </>
          ) : (
            <>
              <div className="mx-auto h-16 w-16 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] flex items-center justify-center">
                <Lock className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold">{t("noneTitle")}</h1>
                <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
                  {t("noneBody")}
                </p>
              </div>
              <ul className="text-start text-xs text-[var(--foreground-muted)] space-y-2">
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  {t("noneBullet1")}
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  {t("noneBullet2")}
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  {t("noneBullet3")}
                </li>
              </ul>
              <Link href="/kyc/start" className="block">
                <Button size="md" fullWidth>
                  {t("noneCta")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

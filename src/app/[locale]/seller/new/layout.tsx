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
                <h1 className="text-xl font-extrabold">Demande de vérification en cours</h1>
                <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
                  L'examen prend généralement entre 10 minutes et 24 heures. Vous recevrez une notification
                  avec le résultat et la possibilité de créer des enchères s'ouvrira automatiquement.
                </p>
              </div>
              <Link href="/kyc/status" className="block">
                <Button variant="secondary" size="md" fullWidth>
                  Voir l'état de la demande
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
                <h1 className="text-xl font-extrabold">Vérification refusée</h1>
                <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
                  Nous n'avons pas pu vérifier votre identité. Veuillez réessayer avec des photos plus
                  nettes et une carte en cours de validité.
                </p>
              </div>
              <Link href="/kyc/start" className="block">
                <Button size="md" fullWidth>
                  Réessayer
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
                <h1 className="text-xl font-extrabold">
                  Vérifiez votre identité d'abord
                </h1>
                <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
                  Pour protéger les acheteurs, nous devons confirmer votre identité avant la publication de
                  votre première enchère. L'opération prend deux minutes : photo de carte + selfie.
                </p>
              </div>
              <ul className="text-start text-xs text-[var(--foreground-muted)] space-y-2">
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  Carte d'identité en cours de validité
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  Selfie avec un bon éclairage
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--gold)] shrink-0" />
                  Vous obtiendrez le badge &quot;Identité vérifiée&quot;
                </li>
              </ul>
              <Link href="/kyc/start" className="block">
                <Button size="md" fullWidth>
                  Commencer la vérification maintenant
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

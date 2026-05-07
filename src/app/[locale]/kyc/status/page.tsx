"use client";

import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";

export default function KYCStatusPage() {
  const { user } = useAuth();
  const status = user?.kycStatus ?? "verified";

  if (status === "rejected") {
    return (
      <KYCShell current={3}>
        <div className="space-y-6 py-8 text-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-red-500/15 flex items-center justify-center">
            <span className="text-4xl">✗</span>
          </div>
          <div>
            <h2 className="text-xl font-bold">Nous n'avons pas pu vérifier votre identité</h2>
            <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
              Vérifiez la qualité des photos et réessayez. Si le problème persiste, contactez le support.
            </p>
          </div>
          <div className="space-y-2">
            <Link href="/kyc/start">
              <Button size="lg" fullWidth>
Réessayer
              </Button>
            </Link>
            <Link href="/help">
              <Button size="lg" variant="ghost" fullWidth>
                Contacter le support
              </Button>
            </Link>
          </div>
        </div>
      </KYCShell>
    );
  }

  if (status === "pending") {
    return (
      <KYCShell current={3}>
        <div className="space-y-6 py-8 text-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-amber-500/15 flex items-center justify-center">
            <span className="text-4xl">⏳</span>
          </div>
          <div>
            <h2 className="text-xl font-bold">Examen humain en cours</h2>
            <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
              Votre compte a été transféré pour un examen manuel. Vous recevrez le résultat sous 24 heures.
            </p>
          </div>
          <Link href="/">
            <Button size="lg" fullWidth>
Retour à l'accueil
            </Button>
          </Link>
        </div>
      </KYCShell>
    );
  }

  // verified
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
            <CheckCircle2 className="h-12 w-12 text-white" strokeWidth={2.5} />
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-extrabold">Vérifié avec succès</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
            Félicitations ! Votre compte est maintenant vérifié et vous pouvez créer vos enchères ou
            participer aux enchères en toute confiance.
          </p>
        </div>

        <div className="rounded-[var(--radius-md)] bg-[var(--gold-faint)] border border-[var(--gold-soft)]/40 p-4">
          <div className="flex items-center justify-center gap-2 text-[var(--gold)] font-bold mb-1">
            <ShieldCheck className="h-5 w-5" />
Votre identité est vérifiée
          </div>
          <div className="text-xs text-[var(--foreground-muted)]">
            Le badge &quot;Identité vérifiée&quot; apparaît sur chacune de vos enchères
          </div>
        </div>

        <div className="space-y-2">
          <Link href="/seller/dashboard">
            <Button size="lg" fullWidth>
Commencer comme vendeur
            </Button>
          </Link>
          <Link href="/auctions">
            <Button size="lg" variant="ghost" fullWidth>
Parcourir les enchères
            </Button>
          </Link>
        </div>
      </div>
    </KYCShell>
  );
}

"use client";

import { Link } from "@/i18n/navigation";
import { CheckCircle2, ShieldCheck, Clock } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";

export default function KYCStatusPage() {
  const { user, loaded } = useAuth();
  // Default to "pending" while the user object is hydrating — the user
  // just submitted, so showing them the waiting screen is the right
  // optimistic guess.
  const status = loaded ? user?.kycStatus ?? "pending" : "pending";

  if (status === "rejected") {
    return (
      <KYCShell current={3}>
        <div className="space-y-6 py-8 text-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-red-500/15 flex items-center justify-center">
            <span className="text-4xl">✗</span>
          </div>
          <div>
            <h2 className="text-xl font-bold">
              Nous n&apos;avons pas pu vérifier votre identité
            </h2>
            <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
              Vérifiez la qualité des photos et de la vidéo selfie, puis
              réessayez. Si le problème persiste, contactez le support.
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
            <h2 className="text-2xl font-extrabold">Vérifié avec succès</h2>
            <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
              Félicitations ! Votre compte est maintenant vérifié et vous
              pouvez créer vos enchères ou participer aux enchères en toute
              confiance.
            </p>
          </div>

          <div className="rounded-[var(--radius-md)] bg-[var(--gold-faint)] border border-[var(--gold-soft)]/40 p-4">
            <div className="flex items-center justify-center gap-2 text-[var(--gold)] font-bold mb-1">
              <ShieldCheck className="h-5 w-5" />
              Votre identité est vérifiée
            </div>
            <div className="text-xs text-[var(--foreground-muted)]">
              Le badge &quot;Identité vérifiée&quot; apparaît sur chacune de
              vos enchères
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
          <h2 className="text-2xl font-extrabold">Dossier en cours d&apos;examen</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
            Nous avons bien reçu votre carte d&apos;identité et votre selfie.
            Un administrateur va vérifier manuellement votre visage, vos
            documents et les autres informations.
          </p>
        </div>

        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 text-left space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-[var(--gold)] shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-bold">Délai de vérification : 1 à 2 jours</div>
              <div className="text-xs text-[var(--foreground-muted)] mt-0.5 leading-relaxed">
                Vous recevrez une notification dès que la décision sera prise.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-[var(--gold)] shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-bold">Pas encore d&apos;accès vendeur</div>
              <div className="text-xs text-[var(--foreground-muted)] mt-0.5 leading-relaxed">
                Vous pourrez créer une enchère ou enchérir une fois la
                vérification approuvée.
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Link href="/auctions">
            <Button size="lg" variant="secondary" fullWidth>
              Parcourir les enchères en attendant
            </Button>
          </Link>
          <Link href="/">
            <Button size="lg" variant="ghost" fullWidth>
              Retour à l&apos;accueil
            </Button>
          </Link>
        </div>
      </div>
    </KYCShell>
  );
}

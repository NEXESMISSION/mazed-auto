"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { XCircle, RotateCcw, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function PaymentFailedPage() {
  const router = useRouter();
  const tCommon = useTranslations("common");
  return (
    <div className="min-h-screen flex flex-col px-4 py-8">
      <header className="w-full max-w-md lg:max-w-lg mx-auto mb-4">
        <button
          onClick={() => router.back()}
          aria-label={tCommon("back")}
          className="h-9 w-9 rounded-full bg-[var(--surface)] border border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center">
      <div className="w-full max-w-md lg:max-w-lg space-y-5 lg:space-y-7 text-center">
        {/* Failed Icon */}
        <div className="relative mx-auto h-24 w-24 lg:h-32 lg:w-32">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(239,68,68,0.3), transparent)",
            }}
          />
          <div className="relative h-full w-full rounded-full bg-red-500 flex items-center justify-center">
            <XCircle className="h-12 w-12 lg:h-16 lg:w-16 text-white" strokeWidth={2.5} />
          </div>
        </div>

        <div>
          <h1 className="text-2xl lg:text-4xl xl:text-5xl font-extrabold lg:font-black lg:tracking-tight">
            Échec du paiement
          </h1>
          <p className="text-sm lg:text-base text-[var(--foreground-muted)] mt-2 lg:mt-3 leading-relaxed max-w-md mx-auto">
            La passerelle de paiement a refusé la transaction. Ne vous inquiétez pas, aucun montant n&apos;a été
            débité de votre compte.
          </p>
        </div>

        <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-4 text-right text-sm text-[var(--foreground-muted)] leading-relaxed">
          <strong className="text-red-400">Cause probable :</strong> solde insuffisant ou
          informations de carte incorrectes. Vérifiez vos données et réessayez, ou choisissez un autre
          moyen de paiement.
        </div>

        <div className="space-y-2 pt-2">
          <Link href="/payment/checkout">
            <Button size="lg" fullWidth>
              <RotateCcw className="h-4 w-4" />
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
      </div>
    </div>
  );
}

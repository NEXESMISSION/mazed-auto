"use client";

import { Link } from "@/i18n/navigation";
import { XCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function PaymentFailedPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-5 text-center">
        {/* Failed Icon */}
        <div className="relative mx-auto h-24 w-24">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(239,68,68,0.3), transparent)",
            }}
          />
          <div className="relative h-full w-full rounded-full bg-red-500 flex items-center justify-center">
            <XCircle className="h-12 w-12 text-white" strokeWidth={2.5} />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-extrabold">Échec du paiement</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
            La passerelle de paiement a refusé la transaction. Ne vous inquiétez pas, aucun montant n'a été
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
  );
}

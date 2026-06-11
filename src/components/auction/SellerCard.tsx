import { ShieldCheck, UserRound, Car } from "lucide-react";
import type { SellerCardData } from "@/lib/auction/detail";

/**
 * Buyer-facing seller trust card ("Vendeur") — v1 AnonSellerCard parity.
 * Shows trust signals only, never the seller's identity: at most a first
 * name + last initial (already anonymized server-side in
 * `getPublicSellerCard`), the account kind (particulier / professionnel),
 * member-since month, KYC chip, and a public lot count. No profile link,
 * no contact details — coordinates are exchanged after adjudication.
 */
export function SellerCard({
  seller,
  className = "",
}: {
  seller: SellerCardData;
  className?: string;
}) {
  const roleLabel = seller.isPro ? "Vendeur professionnel" : "Vendeur particulier";
  const initial = seller.displayName?.trim()[0]?.toUpperCase() ?? null;
  const memberSince = new Date(seller.memberSince).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <section className={`rounded-2xl border border-border bg-surface p-5 ${className}`}>
      <h2 className="batta-eyebrow flex items-center gap-2">
        <span aria-hidden className="batta-gold-rule-short" />
        Vendeur
      </h2>

      <div className="mt-3 flex items-center gap-3">
        {/* Avatar disc — initial when we have a name, neutral glyph otherwise. */}
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2">
          {initial ? (
            <span className="text-[16px] font-extrabold leading-none text-gold">
              {initial}
            </span>
          ) : (
            <UserRound className="size-5 text-subtle" strokeWidth={2} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[14.5px] font-bold text-foreground">
              {seller.displayName ?? roleLabel}
            </span>
            {seller.kycVerified && (
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
                Vérifié
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {seller.displayName ? `${roleLabel} · ` : ""}
            Membre depuis {memberSince}
          </div>
        </div>
      </div>

      {/* Trust chips — concrete signals only (no abstract scores). */}
      {(seller.kycVerified || seller.lotCount > 0) && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {seller.kycVerified && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-faint px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-gold">
              <ShieldCheck className="size-3" strokeWidth={2.5} />
              Identité vérifiée
            </span>
          )}
          {seller.lotCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted ring-1 ring-border">
              <Car className="size-3" strokeWidth={2.2} />
              {seller.lotCount} {seller.lotCount === 1 ? "lot publié" : "lots publiés"}
            </span>
          )}
        </div>
      )}

      <p className="mt-3 text-[10.5px] leading-relaxed text-subtle">
        L&apos;identité complète et les coordonnées du vendeur ne sont jamais
        affichées publiquement.
      </p>
    </section>
  );
}

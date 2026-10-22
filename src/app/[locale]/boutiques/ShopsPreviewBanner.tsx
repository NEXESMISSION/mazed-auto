import { Eye } from "lucide-react";

/**
 * Shown to an admin on shop pages that visitors cannot reach yet
 * (`app_settings.pro_shops.enabled` is off): what they are looking at is a
 * preview, and how it goes live.
 */
export function ShopsPreviewBanner({ who = "admin" }: { who?: "admin" | "owner" }) {
  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-gold-faint px-4 py-3 text-[12.5px] leading-relaxed text-gold ring-1 ring-gold-soft">
      <Eye className="mt-0.5 size-4 shrink-0" />
      {who === "owner" ? (
        <p>
          <strong>Aperçu de votre page.</strong> Les pages boutiques ne sont pas encore ouvertes au
          public : vous seul la voyez. Profitez-en pour la compléter depuis l&apos;espace pro.
        </p>
      ) : (
        <p>
          <strong>Aperçu administrateur.</strong> Les pages boutiques ne sont pas encore publiques :
          un visiteur obtient une page introuvable. Elles s&apos;ouvrent à tous dès que « Boutiques
          professionnelles » est activé dans Admin → Site → Réglages.
        </p>
      )}
    </div>
  );
}

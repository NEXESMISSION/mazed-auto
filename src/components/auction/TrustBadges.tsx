import { ShieldCheck, FileCheck, Award, Phone } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { Seller } from "@/lib/types";

interface Props {
  seller: Seller;
  compact?: boolean;
}

/**
 * Verification badges for a seller. Trust score / level numbers are
 * intentionally not surfaced — concrete verification is what helps the buyer
 * (KYC done? ownership verified? Pro account?), not an abstract aggregate.
 */
export function TrustBadges({ seller, compact }: Props) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {seller.verifiedKyc && (
          <Badge variant="gold" size="sm">
            <ShieldCheck className="h-3 w-3" />
            Vérifié
          </Badge>
        )}
        {seller.isPro && (
          <Badge variant="goldFilled" size="sm">
            <Award className="h-3 w-3" />
            Pro
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {seller.verifiedKyc && (
        <Badge variant="gold">
          <ShieldCheck className="h-3.5 w-3.5" />
          Identité vérifiée
        </Badge>
      )}
      {seller.verifiedOwnership && (
        <Badge variant="gold">
          <FileCheck className="h-3.5 w-3.5" />
          Propriété vérifiée
        </Badge>
      )}
      {seller.isPro && (
        <Badge variant="goldFilled">
          <Award className="h-3.5 w-3.5" />
          Vendeur Pro
        </Badge>
      )}
      {seller.successfulDeals > 0 && (
        <Badge variant="default">
          <Phone className="h-3.5 w-3.5" />
          {seller.successfulDeals} {seller.successfulDeals === 1 ? "vente réussie" : "ventes réussies"}
        </Badge>
      )}
    </div>
  );
}

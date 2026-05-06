import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/server";

interface Props {
  userId: string;
  firstName: string;
  kycVerified: boolean;
  role: "buyer" | "seller" | "admin";
}

/**
 * Top hero for signed-in users — avatar + name/email row, search affordance,
 * and a bold two-line tagline. Mirrors the home-screen header in the
 * reference: greeting on top, big headline below, no top bar above it.
 */
export async function SignedInHero({ firstName, kycVerified }: Props) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? "";

  return (
    <section className="px-4 pt-6">
      {/* Identity row */}
      <div className="flex items-center gap-3">
        <Link href="/profile" className="relative shrink-0" aria-label="Mon profil">
          <Avatar size="md" alt={firstName || email} />
          {kycVerified && (
            <span
              className="absolute -bottom-0.5 -end-0.5 h-4 w-4 rounded-full bg-[var(--gold)] border-2 border-background flex items-center justify-center"
              title="Identité vérifiée"
            >
              <ShieldCheck className="h-2.5 w-2.5 text-black" strokeWidth={3} />
            </span>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px] truncate leading-tight">
            {firstName || email.split("@")[0] || "Bienvenue"}
          </div>
          <div className="text-[11px] text-[var(--foreground-muted)] truncate mt-0.5">
            {email}
          </div>
        </div>
        <Link
          href="/auctions"
          className="h-10 w-10 shrink-0 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--gold-soft)] hover:bg-[var(--surface-2)] transition-colors"
          aria-label="Recherche"
        >
          <Search className="h-[18px] w-[18px]" />
        </Link>
      </div>

      {/* Bold two-line tagline — frames the rails below */}
      <h1 className="mt-7 text-[26px] font-extrabold tracking-tight leading-[1.15]">
        Dernières <span className="gradient-gold-text">Enchères</span>
        <br />
        et nouvelles offres
      </h1>
    </section>
  );
}

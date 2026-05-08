import { Link } from "@/i18n/navigation";
import { ShieldCheck, LogIn } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { HeaderIcons } from "@/components/layout/HeaderIcons";

interface Props {
  signedIn: boolean;
  firstName: string;
  email: string;
  kycVerified: boolean;
}

/**
 * Identity row + bold two-line headline. Avatar/login on the start, the
 * shared messages + notifications cluster always sits at the end so the
 * action surface is consistent with the browse header and global TopBar.
 */
export function HomeHeader({ signedIn, firstName, email, kycVerified }: Props) {
  return (
    <section className="px-4 pt-6">
      <div className="flex items-center gap-3">
        {signedIn ? (
          <>
            <Link
              href="/profile"
              className="relative shrink-0"
              aria-label="Mon profil"
            >
              <Avatar size="md" alt={firstName || email} />
              {kycVerified && (
                <span
                  className="absolute -bottom-0.5 -end-0.5 h-4 w-4 rounded-full bg-[var(--gold)] border-2 border-background flex items-center justify-center"
                  title="Identité vérifiée"
                >
                  <ShieldCheck
                    className="h-2.5 w-2.5 text-black"
                    strokeWidth={3}
                  />
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
            <HeaderIcons />
          </>
        ) : (
          <>
            <div className="h-11 w-11 shrink-0 rounded-full overflow-hidden ring-1 ring-[var(--gold-soft)]/60 shadow-[var(--shadow-gold)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Mazed Auto"
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[15px] truncate leading-tight">
                Mazed Auto
              </div>
              <div className="text-[11px] text-[var(--foreground-muted)] truncate mt-0.5">
                Enchères de confiance — Tunisie
              </div>
            </div>
            <Link
              href="/login"
              className="h-10 w-10 shrink-0 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--gold-soft)] hover:bg-[var(--surface-2)] transition-colors"
              aria-label="Se connecter"
            >
              <LogIn className="h-[18px] w-[18px]" />
            </Link>
          </>
        )}
      </div>

      <h1 className="mt-7 text-[26px] font-extrabold tracking-tight leading-[1.15]">
        Dernières <span className="gradient-gold-text">enchères</span>
        <br />
        et mises à jour !
      </h1>
    </section>
  );
}

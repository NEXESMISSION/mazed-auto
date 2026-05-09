import { Link } from "@/i18n/navigation";
import { HeaderIcons } from "@/components/layout/HeaderIcons";

interface Props {
  signedIn: boolean;
}

/**
 * Home header — logo + brand on the start, messages + notifications on
 * the end for everyone (signed in or out). The earlier signed-out
 * variant rendered a LogIn door icon that read as a "exit" affordance
 * to users; sign-in is reachable via the bottom-tab profile screen
 * instead, so the home doesn't need a duplicate. Logout lives in
 * /profile, not here.
 */
export function HomeHeader({ signedIn: _signedIn }: Props) {
  return (
    <section className="px-4 pt-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="h-11 w-11 shrink-0 rounded-full overflow-hidden ring-1 ring-[var(--gold-soft)]/60 shadow-[var(--shadow-gold)]"
          aria-label="Mazed Auto"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Mazed Auto"
            className="h-full w-full object-cover"
            draggable={false}
          />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px] truncate leading-tight">
            Mazed Auto
          </div>
          <div className="text-[11px] text-[var(--foreground-muted)] truncate mt-0.5">
            Enchères de confiance — Tunisie
          </div>
        </div>
        {/* hideWhenSignedOut={false} so guests see the icons too — taps
            on /messages / notifications redirect to login if needed. */}
        <HeaderIcons hideWhenSignedOut={false} />
      </div>
    </section>
  );
}

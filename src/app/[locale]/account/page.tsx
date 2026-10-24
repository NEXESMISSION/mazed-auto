import { Fragment } from "react";
import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { accountLabel } from "@/lib/identity";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { LocaleChoice } from "@/components/i18n/LocaleSwitch";
import {
  Plus,
  Wallet,
  ChevronRight,
  ChevronLeft,
  Building2,
  Heart,
  LayoutDashboard,
  Briefcase,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";

// Per-user, auth-gated — never static (env-less prerender would throw + fail the build).
export const dynamic = "force-dynamic";

/** Favoris has its own page now (the old activity hub was auction-shaped and
 *  is gone from the nav); /watchlist redirects here. Shared by the mobile card
 *  and the desktop banner so the two cannot drift apart. */
const FAVORIS_HREF = "/account/favoris" as const;

/**
 * Account hub — identity card on top, then grouped action rows. The
 * three group cards use the dark `surface` colour with a gold-tinted
 * hairline, the same recipe used across the redesigned public pages,
 * so the user lands here and sees the same visual system continuing.
 */
export default async function AccountPage() {
  const t = await getTranslations("accountPage");
  const locale = await getLocale();
  const isRTL = locale === "ar";
  const ChevronEnd = isRTL ? ChevronLeft : ChevronRight;

  // Fail-soft: Supabase env missing in dev → render guest banner. Real
  // sign-in flow needs env configured.
  let userId: string | null = null;
  let userEmail: string | null = null;
  let fullName: string | null = null;
  let kycStatus: string = "none";
  let role: string = "individual";
  let shopName: string | null = null;

  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      userEmail = user.email ?? null;
      const [{ data: profile }, { data: membership }] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, kyc_status, role, phone")
          .eq("id", user.id)
          .single(),
        // The person's own memberships are readable with their own token
        // (shop_members_read, 0185), and a shop's name is public.
        supabase.from("shop_members").select("shop:shops (name, status)").eq("user_id", user.id).limit(5),
      ]);
      const open = ((membership ?? []) as unknown as { shop: { name: string; status: string } | null }[])
        .map((m) => m.shop)
        .find((s) => s && s.status !== "closed");
      shopName = open?.name ?? null;
      fullName = profile?.full_name ?? null;
      // The account is a PHONE account: `user.email` is the synthetic
      // 216…@phone.mazedauto.app that signup mints for Supabase. Showing it
      // is meaningless to the person reading it — show the number they
      // actually sign in with.
      userEmail = accountLabel(user.email, profile?.phone ?? null);
      kycStatus = profile?.kyc_status ?? "none";
      role = profile?.role ?? "individual";
    }
  } catch {
    // env missing — fall through to guest UI.
  }

  if (!userId) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-[var(--max-w)] flex-col items-center justify-center px-6">
        <div className="relative w-full max-w-sm">
          {/* Ambient gold blob behind the card, very low opacity. */}
          <div
            aria-hidden
            className="batta-gradient-blob batta-gradient-blob-lg absolute -start-1/3 -top-1/4 -z-10 opacity-20"
          />

          <div className="relative overflow-hidden rounded-3xl bg-surface ring-1 ring-border shadow-[var(--shadow-md)]">
            {/* Top gold accent strip. */}
            <div aria-hidden className="batta-gradient-gold h-[2px] w-full" />

            <div className="p-7 sm:p-8">
              <div className="flex flex-col items-center text-center">
                <h1
                  className={`text-[24px] font-extrabold leading-[1.1] tracking-tight ${
                    isRTL ? "font-arabic" : ""
                  }`}
                >
                  <span className="gradient-gold-text">{t("guestTitle")}</span>
                </h1>
                <p className="mt-2 text-[12.5px] text-muted">
                  {t("guestBody")}
                </p>
              </div>

              <div className="mt-7 flex flex-col gap-2.5">
                <Link
                  href="/signup"
                  className="batta-btn-luxe tap-target w-full px-6 py-3 text-[14px]"
                >
                  {t("signup")}
                </Link>
                <Link
                  href="/login"
                  className="batta-btn-ghost-gold tap-target w-full px-6 py-3 text-[14px]"
                >
                  {t("login")}
                </Link>
              </div>
            </div>

            <div className="border-t border-border bg-surface-2 px-7 py-4 text-center sm:px-8">
              <Link
                href="/annonces"
                className="inline-flex items-center gap-1.5 text-[12px] font-bold text-muted transition hover:text-gold-bright"
              >
                {t("guestExplore")}
                <ArrowRight
                  className={`size-3 ${isRTL ? "rotate-180" : ""}`}
                  strokeWidth={2.4}
                />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Signed-in surface.
  const roleActions: ActionItem[] = [];
  // The inspector branches that used to sit here were dead (`&& false`) from
  // the day the network was deleted; they only kept their imports alive.
  if (role === "admin") {
    // Not "Annonces, KYC, experts" — KYC and the expert network are both gone.
    roleActions.push({ href: "/admin", Icon: LayoutDashboard, title: t("actions.admin.title"), body: t("actions.admin.body") });
  }
  // « Espace partenaire » pointed at /partners/dashboard, which redirects to
  // /account — a loop. A member of a shop now gets their pro space instead.
  if (shopName) {
    roleActions.push({ href: "/pro/dashboard", Icon: Briefcase, title: t("actions.shop.title"), body: t("actions.shop.body", { shop: shopName }) });
  }

  // Grouped by journey so a buyer is not handed a seller dashboard and vice
  // versa: the role-specific space under "Mon compte", saved annonces and
  // payments under "Acheteur", publishing under "Vendeur".
  // No identity row: KYC is deleted, and trust comes from the "Vendeur
  // vérifié" badge an admin grants — there is nothing for a seller to start
  // or check on here.
  const accountActions: ActionItem[] = [...roleActions];
  // v3: no "Mes activités" — that page is the auction one (bids, watch, wins)
  // and its own card advertised "Enchères, achats et favoris". A buyer here has
  // exactly two things of their own: what they saved, and what they paid.
  const buyerActions: ActionItem[] = [
    { href: "/account/favoris", Icon: Heart, title: t("actions.favorites.title"), body: t("actions.favorites.body") },
    { href: "/account/payments", Icon: Wallet, title: t("sections.payments"), body: t("sections.paymentsBody") },
  ];
  // "Tableau du vendeur" pointed at /sell — the v2 auction form, complete with
  // mise à prix and caution. Selling in v3 is: publish an annonce, then manage
  // the ones you have.
  const sellerActions: ActionItem[] = [
    { href: "/annonces/nouvelle", Icon: Plus, title: t("actions.publish.title"), body: t("actions.publish.body") },
    { href: "/account/listings", Icon: Building2, title: t("actions.listings.title"), body: t("actions.listings.body") },
  ];
  const groups: { label: string; items: ActionItem[] }[] = [
    { label: t("groups.account"), items: accountActions },
    { label: t("groups.buyer"), items: buyerActions },
    { label: t("groups.seller"), items: sellerActions },
  ];
  const kycLabel = t(`kyc.${["verified", "submitted", "pending", "rejected"].includes(kycStatus) ? kycStatus : "none"}`);

  const identity = (
    <section className="batta-surface-navy-luxe relative overflow-hidden rounded-2xl p-6 ring-1 ring-gold/25">
      <div className="flex items-start gap-3">
        <span className="batta-monogram batta-monogram-filled size-12 shrink-0 text-[20px] font-extrabold">
          {(fullName ?? userEmail ?? "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={`truncate text-[16px] font-extrabold leading-tight text-foreground ${
              isRTL ? "font-arabic" : ""
            }`}
          >
            {fullName ?? userEmail ?? ""}
          </div>
          {fullName && userEmail && (
            <div className="mt-0.5 truncate text-[11px] text-muted">{userEmail}</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <KycPill status={kycStatus} label={kycLabel} />
            {role !== "individual" && <span className="batta-pill-gold">{role}</span>}
          </div>
        </div>
      </div>
      {/* Favoris — hoisted out of the "Acheteur" list (where it was only a
          line of body copy under "Mes activités") to the identity card, so
          the cars someone saved are one tap from the top of the hub. Points
          at the favoris TAB of the activity page; /watchlist only redirects
          there, and going through it costs an extra hop. */}
      <Link
        href={FAVORIS_HREF}
        className="tap-target mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold-faint px-4 py-2.5 text-[13px] font-bold text-gold ring-1 ring-gold-soft/60 transition hover:bg-gold-faint/80"
      >
        <Heart className="size-4" strokeWidth={2.2} />
        {t("actions.favorites.title")}
      </Link>
    </section>
  );

  return (
    <>
      {/* ── MOBILE / tablet (< lg) — single column, unchanged ── */}
      <div className="lg:hidden mx-auto max-w-[var(--max-w)] px-4 py-6">
        {identity}
        {groups.map((g) => (
          <section key={g.label} className="mt-5">
            <p className="batta-eyebrow mb-2">{g.label}</p>
            <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-border">
              {g.items.map((a, i) => (
                <Fragment key={a.href}>
                  <Row {...a} ChevronEnd={ChevronEnd} isRTL={isRTL} />
                  {i < g.items.length - 1 && <Divider />}
                </Fragment>
              ))}
            </div>
          </section>
        ))}
        <section className="mt-5">
          <p className="batta-eyebrow mb-2">{t("sections.language")}</p>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-4 ring-1 ring-border">
            <span className="text-[14px] font-bold text-foreground">{t("languageRow")}</span>
            <LocaleChoice />
          </div>
        </section>
        <div className="mt-6">
          <SignOutButton label={t("logout")} />
        </div>
      </div>

      {/* ── DESKTOP (lg+) — white profile banner + 3-col action grid ── */}
      <div className="hidden lg:block mx-auto max-w-6xl px-8 py-10">
        <section className="flex items-center gap-6 rounded-3xl bg-surface p-8 ring-1 ring-border">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[var(--gold)] text-[24px] font-extrabold text-white">
            {(fullName ?? userEmail ?? "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className={`text-[24px] font-extrabold tracking-tight ${isRTL ? "font-arabic" : ""}`}>
                {fullName ?? userEmail ?? ""}
              </h1>
              <KycPill status={kycStatus} label={kycLabel} />
              {role !== "individual" && <span className="batta-pill-gold">{role}</span>}
            </div>
            {fullName && userEmail && (
              <p className="mt-1 text-[13.5px] text-muted">{userEmail}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <LocaleChoice />
            <Link
              href={FAVORIS_HREF}
              className="inline-flex items-center gap-2 rounded-xl bg-gold-faint px-4 py-2.5 text-[13.5px] font-bold text-gold ring-1 ring-gold-soft/60 transition hover:bg-gold-faint/80"
            >
              <Heart className="size-4" strokeWidth={2.2} />
              {t("actions.favorites.title")}
            </Link>
            <SignOutButton label={t("logout")} />
          </div>
        </section>

        {groups.map((g) => (
          <div key={g.label} className="mt-8">
            <p className="batta-eyebrow mb-4">{g.label}</p>
            <div className="grid grid-cols-3 gap-4">
              {g.items.map((a) => (
                <ActionTile key={a.href} {...a} isRTL={isRTL} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

type ActionItem = {
  href: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
};

/** Desktop action card — matches the mockup: blue icon badge, title +
 *  corner arrow, description; lifts with a soft blue shadow on hover. */
function ActionTile({ href, Icon, title, body, isRTL }: ActionItem & { isRTL: boolean }) {
  return (
    <Link
      href={href as `/${string}`}
      className="group rounded-2xl bg-surface p-6 ring-1 ring-border transition hover:-translate-y-0.5 hover:ring-gold-soft/60 hover:shadow-[0_12px_30px_-14px_rgba(30,58,138,0.35)]"
    >
      <span className="mb-5 inline-flex size-11 items-center justify-center rounded-2xl bg-gold-faint text-gold">
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <div className="flex items-center justify-between gap-2">
        <h3 className={`text-[17px] font-bold leading-tight text-foreground ${isRTL ? "font-arabic" : ""}`}>
          {title}
        </h3>
        <ArrowUpRight className="size-4 shrink-0 text-muted transition group-hover:text-gold" strokeWidth={2} />
      </div>
      <p className="mt-1 text-[13px] leading-snug text-muted">{body}</p>
    </Link>
  );
}

function KycPill({ status, label }: { status: string; label: string }) {
  const tone =
    status === "verified" ? "batta-tone-ok"
    : status === "submitted" || status === "pending" ? "batta-tone-warn"
    : status === "rejected" ? "batta-tone-bad"
    : "bg-surface-2 text-muted border border-border";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] ${tone}`}>
      {label}
    </span>
  );
}

function Row({
  href,
  Icon,
  title,
  body,
  ChevronEnd,
  isRTL,
}: {
  href: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
  ChevronEnd: React.ComponentType<{ className?: string }>;
  isRTL: boolean;
}) {
  return (
    <Link
      href={href as `/${string}`}
      className="tap-target flex items-center gap-3 p-4 transition hover:bg-surface-2 active:bg-surface-2"
    >
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold-faint text-gold ring-1 ring-gold/30">
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-[14px] font-bold text-foreground ${isRTL ? "font-arabic" : ""}`}>
          {title}
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-muted">{body}</div>
      </div>
      <ChevronEnd className="size-5 text-muted" />
    </Link>
  );
}

function Divider() {
  return <div className="mx-4 h-px bg-border" />;
}

import { getTranslations, getLocale } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthHeroPanel } from "@/components/auth/AuthHeroPanel";
import { AuthBrand } from "@/components/auth/AuthBrand";
import { LocaleSwitch } from "@/components/i18n/LocaleSwitch";
import { Link } from "@/i18n/navigation";

/**
 * Login surface.
 *   - Mobile (< lg): the logo small at the top start (left, right in
 *     Arabic), where the site's top bar puts it, over a centered card.
 *   - Desktop (lg+): a split screen — the brand hero at the start (logo at
 *     its top start), the sign-in card at the end.
 * The cards carry no logo of their own: one per screen, in its usual place.
 */
export default async function LoginPage() {
  const t = await getTranslations();
  const ta = await getTranslations("auth.login");
  const locale = await getLocale();
  const isRTL = locale === "ar";

  return (
    <>
      {/* ── MOBILE / tablet (< lg) — logo top start, centered card ── */}
      <div className="lg:hidden mx-auto flex min-h-dvh max-w-[var(--max-w)] flex-col px-6 pt-safe">
        {/* No site bar on the auth pages, so the language switch sits here. */}
        <div className="-mx-2 flex h-14 items-center justify-between">
          <AuthBrand />
          <LocaleSwitch />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center pb-14">
          <div className="relative w-full max-w-sm">
            <div
              aria-hidden
              className="batta-gradient-blob batta-gradient-blob-lg absolute -start-1/3 -top-1/4 -z-10 opacity-20"
            />

            <div className="relative overflow-hidden rounded-3xl bg-surface ring-1 ring-border shadow-[var(--shadow-md)]">
              <div aria-hidden className="batta-gradient-gold h-[2px] w-full" />

              <div className="p-7 sm:p-8">
                <div className="flex flex-col items-center text-center">
                  <h1
                    className={`text-[24px] font-extrabold leading-[1.1] tracking-tight ${
                      isRTL ? "font-arabic" : ""
                    }`}
                  >
                    <span className="gradient-gold-text">{t("nav.login")}</span>
                  </h1>
                </div>

                <div className="mt-7">
                  <LoginForm />
                </div>
                <p className="mt-4 text-center text-[12.5px]">
                  <Link
                    href="/forgot-password"
                    className="font-semibold text-muted transition hover:text-gold-bright"
                  >
                    {ta("forgot")}
                  </Link>
                </p>
              </div>

              <div className="border-t border-border bg-surface-2 px-7 py-4 text-center sm:px-8">
                <p className="text-[12.5px] text-muted">
                  {ta("noAccount")}{" "}
                  <Link
                    href="/signup"
                    className="font-bold text-foreground transition hover:text-gold-bright"
                  >
                    {t("nav.signup")}
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── DESKTOP (lg+) — one-screen split: hero + sign-in card ── */}
      <div className="hidden h-[100dvh] overflow-hidden lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <AuthHeroPanel />

        <div className="relative flex h-[100dvh] items-center justify-center overflow-y-auto bg-surface-2 px-8 py-10">
          <LocaleSwitch className="absolute end-8 top-6" />
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-surface p-8 shadow-[0_36px_90px_-34px_rgba(15,23,42,0.4)] ring-1 ring-border">
            <div aria-hidden className="batta-gradient-gold absolute inset-x-0 top-0 h-[3px]" />

            <div className="flex flex-col items-center text-center">
              <h1
                className={`text-[28px] font-extrabold leading-[1.1] tracking-tight ${
                  isRTL ? "font-arabic" : ""
                }`}
              >
                {ta.rich("welcomeBack", { gold: (chunks) => <span className="gradient-gold-text">{chunks}</span> })}
              </h1>
              <p className="mt-2 text-[13px] text-muted">
                {ta("subtitle")}
              </p>
            </div>

            <div className="mt-8">
              <LoginForm />
            </div>
            <p className="mt-4 text-center text-[13px]">
              <Link
                href="/forgot-password"
                className="font-semibold text-muted transition hover:text-gold-bright"
              >
                {ta("forgot")}
              </Link>
            </p>

            <p className="mt-6 text-center text-[13px] text-muted">
              {ta("noAccount")}{" "}
              <Link
                href="/signup"
                className="font-bold text-foreground transition hover:text-gold-bright"
              >
                {t("nav.signup")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

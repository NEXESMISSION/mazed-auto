import { getLocale, getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { AuthHeroPanel } from "@/components/auth/AuthHeroPanel";
import { AuthBrand } from "@/components/auth/AuthBrand";
import { LocaleSwitch } from "@/components/i18n/LocaleSwitch";
import { Link } from "@/i18n/navigation";

/**
 * "Forgot password" page — the phone, an SMS code, then the new password (see
 * ForgotPasswordForm).
 *   - Mobile (< lg): the logo small at the top start, over a centered card.
 *   - Desktop (lg+): the same split-screen hero + card as login/signup, so the
 *     whole auth quartet is visually coherent (previously this collapsed to a
 *     lonely 384px card on a vast empty desktop field).
 */
export default async function ForgotPasswordPage() {
  const locale = await getLocale();
  const isRTL = locale === "ar";
  const t = await getTranslations("auth.forgot");

  const Card = (
    <div className="relative overflow-hidden rounded-3xl bg-surface ring-1 ring-border shadow-[var(--shadow-md)]">
      <div aria-hidden className="batta-gradient-gold h-[2px] w-full" />
      <div className="p-7 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <h1
            className={`text-[24px] font-extrabold leading-[1.1] tracking-tight ${
              isRTL ? "font-arabic" : ""
            }`}
          >
            <span className="gradient-gold-text">{t("title")}</span>
          </h1>
          <p className="mt-2 text-[12.5px] text-muted">
            {t("subtitle")}
          </p>
        </div>

        <div className="mt-7">
          <ForgotPasswordForm />
        </div>
      </div>

      <div className="border-t border-border bg-surface-2 px-7 py-4 text-center sm:px-8">
        <p className="text-[12.5px] text-muted">
          {t("remember")}{" "}
          <Link
            href="/login"
            className="font-bold text-foreground transition hover:text-gold-bright"
          >
            {t("login")}
          </Link>
        </p>
      </div>
    </div>
  );

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
            {Card}
          </div>
        </div>
      </div>

      {/* ── DESKTOP (lg+) — split: hero + card ── */}
      <div className="hidden h-[100dvh] overflow-hidden lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <AuthHeroPanel />
        <div className="relative flex h-[100dvh] items-center justify-center overflow-y-auto bg-surface-2 px-8 py-10">
          <LocaleSwitch className="absolute end-8 top-6" />
          <div className="w-full max-w-md">{Card}</div>
        </div>
      </div>
    </>
  );
}

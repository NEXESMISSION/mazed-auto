import { useLocale, useTranslations } from "next-intl";
import { Compass, Home } from "lucide-react";

/**
 * Locale-segment 404. Rendered when notFound() fires inside [locale]/* or a
 * user hits an unknown path under a valid locale ([...rest] catches those).
 */
export default function NotFound() {
  const t = useTranslations("notFound");
  const locale = useLocale();
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-gold-faint text-gold ring-1 ring-gold/30">
        <Compass className="size-7" strokeWidth={1.8} />
      </div>
      <h1 className="mt-5 text-[22px] font-extrabold leading-tight tracking-tight">
        {t("title")}
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--foreground-muted)]">
        {t("body")}
      </p>
      {/* A real navigation, not a client-side <Link>. This renders on a 404,
          where the router is already in an error state — a hard load is what
          resets it. */}
      <a
        href={`/${locale}`}
        className="batta-btn-luxe tap-target mt-6 h-11 rounded-full px-6 text-[13px]"
      >
        <Home className="size-4" strokeWidth={2.2} />
        {t("home")}
      </a>
    </div>
  );
}

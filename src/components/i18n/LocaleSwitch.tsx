"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { LOCALE_COOKIE, routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** Each language in its own name — what a reader of it looks for. */
export const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", ar: "العربية" };

// The Arabic name on a French page is drawn in the system font. In the site's
// stack it would fall through to Cairo, and every French page would download
// the Arabic font for one word.
const SYSTEM_FONT = { fontFamily: "system-ui, -apple-system, sans-serif" };

/**
 * Switch the whole site to another language, on the same page.
 *
 * A full load, not a client navigation: a soft switch would keep what the old
 * language already drew on the client (half-filled forms, toasts, the router's
 * cached pages) and flip the direction under it. The cookie is what sends a
 * later unprefixed URL ("/", an old link) to the chosen language — see the
 * middleware.
 */
export function useLocaleSwitch() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();

  function go(target: Locale) {
    if (target === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    const rest = pathname === "/" ? "" : pathname;
    window.location.assign(`/${target}${rest}${window.location.search}${window.location.hash}`);
  }

  const nameStyle = (l: Locale) => (l === "ar" && locale !== "ar" ? SYSTEM_FONT : undefined);

  return { locale, other: (locale === "ar" ? "fr" : "ar") as Locale, go, nameStyle };
}

/** The top bars' control: one pill naming the other language. */
export function LocaleSwitch({ className }: { className?: string }) {
  const t = useTranslations("language");
  const { other, go, nameStyle } = useLocaleSwitch();
  return (
    <button
      type="button"
      onClick={() => go(other)}
      lang={other}
      title={t(`switchTo.${other}`)}
      style={nameStyle(other)}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-full border border-border px-3 text-[12.5px] font-bold text-muted transition-colors hover:border-gold-soft/60 hover:text-foreground",
        className,
      )}
    >
      {LOCALE_NAMES[other]}
    </button>
  );
}

/**
 * Both languages side by side, the current one marked — for the account menu
 * and the account page, where there is room to show the choice as a choice.
 * `itemRole` lets it sit inside a role="menu" as radio items.
 */
export function LocaleChoice({ itemRole }: { itemRole?: "menuitemradio" }) {
  const t = useTranslations("language");
  const { locale, go, nameStyle } = useLocaleSwitch();
  return (
    <div role={itemRole ? "group" : "radiogroup"} aria-label={t("label")} className="inline-flex rounded-full border border-border bg-surface-2 p-0.5">
      {routing.locales.map((l) => {
        const current = l === locale;
        return (
          <button
            key={l}
            type="button"
            role={itemRole ?? "radio"}
            aria-checked={current}
            lang={l}
            onClick={() => go(l)}
            style={nameStyle(l)}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-bold transition-colors",
              current ? "bg-foreground text-[var(--background)]" : "text-muted hover:text-foreground",
            )}
          >
            {LOCALE_NAMES[l]}
          </button>
        );
      })}
    </div>
  );
}

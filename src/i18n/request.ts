import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // The Social Publisher keeps its texts in its own files (plan §4: a module
  // that can move to Mazed Immo), translated for Arabic from the start (D-S5).
  const social = await import(`../../messages/social/${locale}.json`).then((m) => m.default, () => ({}));
  return {
    locale,
    messages: { ...(await import(`../../messages/${locale}.json`)).default, social },
  };
});

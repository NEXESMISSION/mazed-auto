import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { AREAS } from "./areas";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // The core file, then one file per area under its own namespace (see
  // areas.ts). The Social Publisher started the pattern (plan §4: a module
  // that can move to Mazed Immo). A missing area file is an empty namespace.
  const core = (await import(`../../messages/${locale}.json`)).default;
  const areas = await Promise.all(
    AREAS.map((area) =>
      import(`../../messages/${area}/${locale}.json`).then((m) => [area, m.default] as const, () => [area, {}] as const),
    ),
  );
  return {
    locale,
    messages: { ...core, ...Object.fromEntries(areas) },
  };
});

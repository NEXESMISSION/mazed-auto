"use client";

import { useEffect } from "react";

/**
 * Puts the locale's direction and language on <html> itself.
 *
 * The root layout renders <html> without knowing the locale (reading it there
 * would make every page dynamic), so [locale]/layout sets `dir` and `lang` on
 * a wrapper the server renders, and this carries them up to the document for
 * what lives outside that wrapper: portals (dialogs, toasts) and the page's
 * own scrollbar. A no-op while French is the only locale.
 */
export function DocumentDirection({ dir, lang }: { dir: "ltr" | "rtl"; lang: string }) {
  useEffect(() => {
    const html = document.documentElement;
    if (html.dir !== dir) html.dir = dir;
    if (html.lang !== lang) html.lang = lang;
  }, [dir, lang]);
  return null;
}

import { notFound } from "next/navigation";

/**
 * Any path under a locale that no route matches. Calling notFound() here
 * renders [locale]/not-found.tsx inside the locale's layout — translated, with
 * the site's bars — instead of the bare root 404, which knows no language.
 */
export default function CatchAll() {
  notFound();
}

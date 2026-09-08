"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/lib/useHydrated";
import { Check, Link2, Share2 } from "lucide-react";

/**
 * Share this annonce.
 *
 * WHY A FLOATING BUTTON AND NOT A ROW IN THE PAGE. Sharing is not something a
 * buyer does at one point in the page — it is what they do the moment they
 * decide someone else should see this car, which is as likely to be halfway
 * down the photos as at the bottom. A control that scrolls away is a control
 * that is only there for people who were already looking for it.
 *
 * WHY `navigator.share` FIRST. On a phone it opens the OS sheet, and in
 * Tunisia that sheet's first entry is WhatsApp — which is where a car actually
 * gets sent to a brother-in-law. Rebuilding that as our own list of networks
 * would be worse at it and would need a link per network. The clipboard is the
 * fallback for desktop, where no share sheet exists.
 *
 * It renders only after hydration. `navigator.share` cannot be probed on the
 * server, so a server-rendered button would have to guess which of the two
 * behaviours it has and would tell half of the visitors the wrong thing.
 *
 * WHY IT IS PORTALLED TO `document.body`. `position: fixed` is relative to the
 * viewport only while no ancestor establishes a containing block — and
 * `[locale]/template.tsx` wraps every page in `.batta-page-enter`, whose
 * keyframes animate `transform`. That is enough: the button was laid out
 * against the page wrapper instead of the viewport and sat 1400px below the
 * fold, `position: fixed` and invisible. Nothing about the CSS looked wrong;
 * `getBoundingClientRect().y` was the only thing that said so. A portal takes
 * the button out of that subtree entirely, so no future wrapper can catch it.
 */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  // `useSyncExternalStore`, not `setState` in an effect: the server snapshot is
  // false and the client's is true, so React swaps it during hydration without
  // a second render pass — and without the set-state-in-effect the compiler
  // (correctly) complains about.
  const mounted = useHydrated();
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  const share = useCallback(async () => {
    const url = window.location.href;

    // The share sheet, where there is one. A cancelled sheet throws
    // AbortError; that is the user saying no, not a failure to fall back from.
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied (an insecure origin, or a permissions policy). Better
      // to select the URL for the user than to fail silently at them.
      window.prompt("Copiez le lien de cette annonce :", url);
    }
  }, [title]);

  if (!mounted) return null;

  return createPortal(
    <button
      type="button"
      onClick={share}
      aria-label="Partager cette annonce"
      className={
        // Above the mobile publish/bottom bars, and out of the way of the
        // desktop sidebar. `bottom` clears the tab bar plus the notch.
        "fixed z-30 inline-flex items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-bold text-[var(--background)] shadow-[var(--shadow-lg)] transition active:scale-95 "
        + "h-12 end-4 bottom-[calc(var(--batta-bottombar-h,80px)+env(safe-area-inset-bottom)+16px)] "
        + "lg:bottom-8 lg:end-8"
      }
    >
      {copied ? (
        <>
          <Check className="size-4" strokeWidth={2.6} />
          Lien copié
        </>
      ) : (
        <>
          <Share2 className="size-4" strokeWidth={2.3} />
          Partager
        </>
      )}
      {/* A hint of what the fallback will do, for the desktop case where there
          is no share sheet and "Partager" alone is a promise of a dialog that
          will not appear. */}
      <Link2 className="hidden size-3.5 opacity-50 lg:block" strokeWidth={2.2} aria-hidden />
    </button>,
    document.body,
  );
}

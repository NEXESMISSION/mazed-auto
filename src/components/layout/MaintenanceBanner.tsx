"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Top-of-app banner shown when the platform is in maintenance mode.
 * Read-only soft warning — actual write-blocking lives in the bid /
 * payment / listing handlers (each checks system.maintenance_mode
 * before mutating). This is the visible cue.
 *
 * Client component because AppShell is mounted in both server and
 * client pages. The setting row is non-sensitive — RLS allows
 * public read — so this is safe.
 */
export function MaintenanceBanner() {
  const locale = useLocale();
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", [
        "system.maintenance_mode",
        "system.maintenance_message_fr",
        "system.maintenance_message_ar",
      ])
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map = Object.fromEntries(
          data.map((r) => [r.key as string, r.value as unknown]),
        );
        const on = map["system.maintenance_mode"] === true;
        const msg =
          locale === "ar"
            ? (map["system.maintenance_message_ar"] as string | undefined) ??
              ""
            : (map["system.maintenance_message_fr"] as string | undefined) ??
              "";
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEnabled(on);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMessage(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (!enabled) return null;

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/40 text-amber-100 px-4 py-2.5 text-sm flex items-center gap-2 sticky top-0 z-40">
      <Wrench className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {message ||
          "Mazed Auto est en maintenance. Les enchères sont temporairement en lecture seule."}
      </span>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { ADMIN_IDLE_TIMEOUT_MS } from "@/lib/admin";

/**
 * PLAN §22.3: admin sessions auto-time-out after 30 minutes of inactivity.
 * Mounted once at the admin layout level. Watches mouse / keyboard / touch
 * activity; when the idle window passes, signs the user out and redirects
 * to /login so re-auth is required to come back.
 */
export function AdminIdleTimer({ locale }: { locale: string }) {
  const router = useRouter();
  const lastActiveRef = useRef<number>(Date.now());

  useEffect(() => {
    const events: (keyof DocumentEventMap)[] = [
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];
    const onActivity = () => {
      lastActiveRef.current = Date.now();
    };
    for (const ev of events) {
      document.addEventListener(ev, onActivity, { passive: true });
    }

    const tick = setInterval(() => {
      const idle = Date.now() - lastActiveRef.current;
      if (idle > ADMIN_IDLE_TIMEOUT_MS) {
        clearInterval(tick);
        // Soft sign-out: just bounce to login. The next request will refresh
        // the session if it's still valid; if not, the proxy redirects.
        router.replace("/login?redirect=/admin/dashboard&reason=idle", {
          locale,
        });
      }
    }, 60_000);

    return () => {
      clearInterval(tick);
      for (const ev of events) {
        document.removeEventListener(ev, onActivity);
      }
    };
  }, [router, locale]);

  return null;
}

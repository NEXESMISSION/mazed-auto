"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";
import { pushPath, readStack, writeStack } from "@/lib/navStack";

/**
 * Records every in-app navigation into the per-tab stack the TopBar back
 * button reads. Renders nothing.
 *
 * Mounted in MobileShell so it also sees the "flow" routes (login, KYC,
 * checkout) that render without the TopBar — the stack should be a faithful
 * history; navStack.isTransient decides what is a valid destination at READ
 * time, not what gets recorded.
 */
export function NavHistoryTracker() {
  const pathname = usePathname();

  useEffect(() => {
    writeStack(pushPath(readStack(), pathname));
  }, [pathname]);

  return null;
}

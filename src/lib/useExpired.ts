"use client";

import { useEffect, useState } from "react";

/**
 * Returns whether `endTime` has passed, ticking every second on the
 * client. Replaces inline `Date.now()` checks in render bodies — those
 * trip React's purity rule because the value depends on when the
 * component happens to re-render.
 *
 * Initial render returns `false` so the SSR shell paints in the "live"
 * state and the client takes over once the effect mounts. Anything
 * past `endTime` flips to `true` on the next tick (within ~1s).
 */
export function useExpired(endTime: Date): boolean {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const target = endTime.getTime();
    function check() {
      setExpired(Date.now() >= target);
    }
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  return expired;
}

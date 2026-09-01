"use client";

import { useEffect } from "react";

/**
 * Downloads what the selfie step needs while the user is still busy on an
 * earlier KYC screen.
 *
 * The selfie (liveness) step can't start until three things have arrived:
 * the LivenessCheck chunk, the ~2 MB face-api bundle, and the 270 KB of
 * model weights. Fetched at the moment the user lands on the selfie screen,
 * that's a stare at a black box on a phone — the single slowest moment in
 * the whole KYC flow.
 *
 * Mounting this on the CIN steps moves all of it into the 10–30 seconds the
 * user spends photographing their card. By the time they reach the selfie,
 * everything is in the HTTP cache and the camera opens on its own timing.
 *
 * Deliberately conservative:
 *  - runs at idle, so it never competes with the capture/upload in progress;
 *  - skipped entirely on Save-Data or a 2G/slow-2G connection, where 2 MP of
 *    speculative download would cost the user real money and bandwidth they
 *    need for the upload they're actually doing;
 *  - every failure is swallowed — this is a warm-up, and the selfie screen
 *    still fetches everything itself.
 */

const MODEL_FILES = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
  "face_landmark_68_tiny_model-weights_manifest.json",
  "face_landmark_68_tiny_model.bin",
];

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

export function SelfieAssetsPrewarm() {
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: NetworkInformation })
      .connection;
    if (conn?.saveData) return;
    if (conn?.effectiveType === "2g" || conn?.effectiveType === "slow-2g") return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      // The component chunk and the face-api bundle it pulls in.
      import("@/components/auction/LivenessCheck").catch(() => {});
      import("@vladmandic/face-api").catch(() => {});
      // The weights, into the HTTP cache (immutable, see next.config).
      for (const f of MODEL_FILES) {
        fetch(`/models/face-api/${f}`, { cache: "force-cache" }).catch(() => {});
      }
    };

    // requestIdleCallback is missing on Safari < 16.4 — fall back to a timer.
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const usedIdle = typeof w.requestIdleCallback === "function";
    const id = usedIdle
      ? w.requestIdleCallback!(run, { timeout: 3000 })
      : window.setTimeout(run, 1200);

    return () => {
      cancelled = true;
      if (usedIdle) w.cancelIdleCallback?.(id);
      else window.clearTimeout(id);
    };
  }, []);

  return null;
}

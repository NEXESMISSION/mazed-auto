"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Real-time offline overlay. Listens for the browser's online/offline events
 * and paints a full-screen "no internet" panel as soon as the connection
 * drops, instead of letting the user hit a 404 / generic browser error on
 * their next click. The service worker handles cold navigations while
 * offline; this handles users who are mid-session when the connection dies.
 */
export function OfflineOverlay() {
  const t = useTranslations("offline");
  // Start as online to avoid SSR/CSR mismatch flashes; the effect below
  // syncs to the real value on mount.
  const [online, setOnline] = useState(true);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  const retry = async () => {
    setRetrying(true);
    // Probe for actual connectivity — navigator.onLine can lie (it only
    // reports the OS-level network interface). A tiny same-origin HEAD
    // confirms we can really reach the server.
    try {
      const res = await fetch("/manifest.webmanifest", {
        method: "HEAD",
        cache: "no-store",
      });
      if (res.ok) {
        setOnline(true);
        return;
      }
    } catch {
      // still offline
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background px-4"
    >
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="mx-auto h-16 w-16 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[var(--gold)]">
          <WifiOff className="h-7 w-7" />
        </div>
        <div>
          <h1 id="offline-title" className="text-2xl font-extrabold">
            {t("title")}
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
            {t("description")}
          </p>
        </div>
        <Button size="md" fullWidth onClick={retry} disabled={retrying}>
          {retrying ? t("checking") : t("retry")}
        </Button>
      </div>
    </div>
  );
}

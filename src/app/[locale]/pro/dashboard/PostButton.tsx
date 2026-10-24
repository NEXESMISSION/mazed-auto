"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { Loader2 } from "lucide-react";

/**
 * A button that POSTs to one of our routes and then does what the answer says:
 * go to `redirect` (a checkout page, Konnect's payment page) or refresh this
 * one. Errors arrive as the route's `detail`, written for the person reading.
 */
export function PostButton({
  url,
  body,
  children,
  className,
  confirm,
  success,
}: {
  url: string;
  body?: unknown;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  success?: string;
}) {
  const t = useTranslations("pro.post");
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const j = (await res.json().catch(() => ({}))) as { redirect?: string; detail?: string; error?: string };
      if (!res.ok) {
        toast(j.detail ?? t("failed"), "error");
        return;
      }
      if (j.redirect) {
        if (/^https?:\/\//.test(j.redirect)) window.location.assign(j.redirect);
        else router.push(j.redirect as never);
        return;
      }
      if (success) toast(success, "success");
      router.refresh();
    } catch {
      toast(t("network"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={run} disabled={busy} className={`${className ?? ""} disabled:opacity-60`}>
      {busy && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

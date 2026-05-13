import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ReturnClient } from "./ReturnClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /payment/return — server shell + client island. AppShell can't live
 * inside ReturnClient because it imports lib/config (next/headers).
 * The Suspense boundary stays so the search-params hook can hydrate
 * without blocking initial server render.
 */
export default function PaymentReturnPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <ReturnClient />
      </Suspense>
    </AppShell>
  );
}

import { Suspense } from "react";
import { getBankInfo, getD17Info } from "@/lib/config";
import { CheckoutClient } from "./CheckoutClient";

export const dynamic = "force-dynamic";

/**
 * Checkout entrypoint. Server-side fetches the platform's bank +
 * D17 details (admin-editable via /admin/settings) and hands them
 * to the client form. The card tab keeps the simulated flow until
 * Konnect / ClicTopay is wired up.
 */
export default async function CheckoutPage() {
  const [bank, d17] = await Promise.all([getBankInfo(), getD17Info()]);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CheckoutClient bank={bank} d17={d17} />
    </Suspense>
  );
}

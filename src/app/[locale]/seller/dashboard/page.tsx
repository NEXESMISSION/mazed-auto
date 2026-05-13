import { AppShell } from "@/components/layout/AppShell";
import { SellerDashboardClient } from "./SellerDashboardClient";

/**
 * /seller/dashboard route — server shell + client island. AppShell is
 * async (server-only) and can't live in a "use client" file, so this
 * thin server wrapper hands the page contents off to the client
 * component below.
 */
export default function SellerDashboardPage() {
  return (
    <AppShell>
      <SellerDashboardClient />
    </AppShell>
  );
}

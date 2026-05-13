import { AppShell } from "@/components/layout/AppShell";
import { SettingsClient } from "./SettingsClient";

/**
 * /settings route — server shell + client island. AppShell is async
 * (server-only) so we can't render it from a "use client" file, which
 * is what was breaking the production Turbopack build. The interactive
 * page state (modals, toggles, language switch) lives in
 * SettingsClient.
 */
export default function SettingsPage() {
  return (
    <AppShell noTopBar>
      <SettingsClient />
    </AppShell>
  );
}

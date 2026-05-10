import { AppShell } from "@/components/layout/AppShell";
import {
  PrivacyContent,
  LEGAL_LAST_UPDATED,
} from "@/components/legal/LegalContent";

export default function PrivacyPage() {
  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] lg:max-w-[var(--max-w-content)] mx-auto px-4 py-8 md:py-12 space-y-6">
        <header>
          <h1 className="text-[26px] font-extrabold tracking-tight leading-tight">
            Politique de confidentialité
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Dernière mise à jour : {LEGAL_LAST_UPDATED}
          </p>
        </header>

        <PrivacyContent />
      </div>
    </AppShell>
  );
}

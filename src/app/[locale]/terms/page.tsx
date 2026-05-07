import { AppShell } from "@/components/layout/AppShell";

export default function TermsPage() {
  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-8 md:py-12 space-y-6">
        <header>
          <h1 className="text-[26px] font-extrabold tracking-tight leading-tight">
            Conditions d'utilisation
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Dernière mise à jour : Mai 2026
          </p>
        </header>

        <article className="prose-content space-y-5 text-[var(--foreground-muted)] leading-relaxed">
          <Section n="1" title="Acceptation">
            En utilisant Mazed Auto, vous acceptez les présentes conditions. Si vous n'êtes pas d'accord,
            veuillez ne pas utiliser la plateforme.
          </Section>
          <Section n="2" title="Éligibilité">
            Vous devez avoir au moins 18 ans, résider en Tunisie et disposer d'une carte d'identité
            nationale en cours de validité.
          </Section>
          <Section n="3" title="Vérification d'identité">
            Tout vendeur est tenu d'effectuer la vérification KYC avant de publier une enchère. La
            vérification est valable un an.
          </Section>
          <Section n="4" title="Caution de participation">
            Les acheteurs s'engagent à verser 5% du prix de départ pour participer à chaque enchère. La
            caution est intégralement remboursée en cas de défaite et confisquée en cas de retrait après
            victoire.
          </Section>
          <Section n="5" title="Commission Mazed">
            Mazed prélève une commission de 7% (plafonnée à 15 000 DT) auprès du vendeur lors de la
            finalisation de la vente.
          </Section>
          <Section n="6" title="Comportements interdits">
            Sont strictement interdits : la fraude, la falsification, le shill bidding, les paiements hors
            plateforme et toute tentative de contournement du système de vérification.
          </Section>
          <Section n="7" title="Résiliation du compte">
            Mazed se réserve le droit de résilier tout compte enfreignant les présentes conditions, avec
            confiscation des cautions actives selon la politique en vigueur.
          </Section>
          <Section n="8" title="Loi applicable">
            Les présentes conditions sont régies par les lois de la République tunisienne. Le tribunal
            compétent est celui de Tunis.
          </Section>
        </article>
      </div>
    </AppShell>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        <span className="text-[var(--gold)]">{n}.</span>
        {title}
      </h2>
      <p className="text-sm">{children}</p>
    </section>
  );
}

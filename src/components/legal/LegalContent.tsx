// Shared legal copy. Rendered both on the dedicated /terms and /privacy
// pages and inside the LegalLink popup, so we update the wording in one
// place. Kept intentionally light (no AppShell, no padding) so the host
// page or modal owns layout.

export function TermsContent() {
  return (
    <article className="space-y-5 text-[var(--foreground-muted)] leading-relaxed">
      <Section n="1" title="Acceptation">
        En utilisant Mazed Auto, vous acceptez les présentes conditions. Si
        vous n&apos;êtes pas d&apos;accord, veuillez ne pas utiliser la
        plateforme.
      </Section>
      <Section n="2" title="Éligibilité">
        Vous devez avoir au moins 18 ans, résider en Tunisie et disposer
        d&apos;une carte d&apos;identité nationale en cours de validité.
      </Section>
      <Section n="3" title="Vérification d'identité">
        Tout vendeur est tenu d&apos;effectuer la vérification KYC avant de
        publier une enchère. La vérification est valable un an.
      </Section>
      <Section n="4" title="Caution de participation">
        Les acheteurs s&apos;engagent à verser 5% du prix de départ pour
        participer à chaque enchère. La caution est intégralement remboursée
        en cas de défaite et confisquée en cas de retrait après victoire.
      </Section>
      <Section n="5" title="Commission Mazed">
        Mazed prélève une commission de 7% (plafonnée à 15 000 DT) auprès du
        vendeur lors de la finalisation de la vente.
      </Section>
      <Section n="6" title="Comportements interdits">
        Sont strictement interdits : la fraude, la falsification, le shill
        bidding, les paiements hors plateforme et toute tentative de
        contournement du système de vérification.
      </Section>
      <Section n="7" title="Résiliation du compte">
        Mazed se réserve le droit de résilier tout compte enfreignant les
        présentes conditions, avec confiscation des cautions actives selon la
        politique en vigueur.
      </Section>
      <Section n="8" title="Loi applicable">
        Les présentes conditions sont régies par les lois de la République
        tunisienne. Le tribunal compétent est celui de Tunis.
      </Section>
    </article>
  );
}

export function PrivacyContent() {
  return (
    <article className="space-y-5 text-[var(--foreground-muted)] leading-relaxed">
      <S t="Données que nous collectons">
        Données du compte (nom, e-mail, téléphone), photos de la carte
        d&apos;identité nationale, selfies, photos et vidéos des véhicules,
        données de la carte grise, historique des transactions.
      </S>
      <S t="Utilisation de vos données">
        Pour la vérification d&apos;identité, la sécurisation des
        transactions, la diffusion des enchères aux acheteurs intéressés et
        l&apos;envoi de notifications. Nous ne vendons pas vos données à des
        tiers.
      </S>
      <S t="Qui y a accès">
        Seuls les employés autorisés de Mazed (service client, examinateurs
        KYC). Les vendeurs et acheteurs ne voient que les données publiques
        (nom, Trust Score, évaluations).
      </S>
      <S t="Conservation des données">
        Nous conservons vos données pendant la durée de votre activité, et au
        plus 1 an après la fermeture de votre compte.
      </S>
      <S t="Vos droits">
        Accéder à vos données, les corriger, les supprimer ou les télécharger
        — tout cela depuis la page Paramètres.
      </S>
      <S t="Conformité">
        Mazed respecte la loi tunisienne sur la protection des données à
        caractère personnel et est enregistrée auprès de l&apos;INPDP
        (Instance nationale de protection des données personnelles).
      </S>
      <S t="Cookies">
        Nous utilisons uniquement des cookies techniques nécessaires au
        fonctionnement de la plateforme. Aucun cookie publicitaire ou de
        suivi sans votre consentement explicite.
      </S>
      <S t="Contact">
        Pour toute question concernant la confidentialité, écrivez-nous à
        privacy@mazedauto.tn
      </S>
    </article>
  );
}

export const LEGAL_LAST_UPDATED = "Mai 2026";

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

function S({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-foreground">{t}</h2>
      <p className="text-sm">{children}</p>
    </section>
  );
}

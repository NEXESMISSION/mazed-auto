import { AppShell } from "@/components/layout/AppShell";

export default function PrivacyPage() {
  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-8 md:py-12 space-y-6">
        <header>
          <h1 className="text-[26px] font-extrabold tracking-tight leading-tight">
            Politique de confidentialité
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Dernière mise à jour : Mai 2026
          </p>
        </header>

        <article className="space-y-5 text-[var(--foreground-muted)] leading-relaxed">
          <S t="Données que nous collectons">
            Données du compte (nom, e-mail, téléphone), photos de la carte d'identité nationale, selfies,
            photos et vidéos des véhicules, données de la carte grise, historique des transactions.
          </S>
          <S t="Utilisation de vos données">
            Pour la vérification d'identité, la sécurisation des transactions, la diffusion des enchères aux
            acheteurs intéressés et l'envoi de notifications. Nous ne vendons pas vos données à des tiers.
          </S>
          <S t="Qui y a accès">
            Seuls les employés autorisés de Mazed (service client, examinateurs KYC). Les vendeurs et acheteurs
            ne voient que les données publiques (nom, Trust Score, évaluations).
          </S>
          <S t="Conservation des données">
            Nous conservons vos données pendant la durée de votre activité, et au plus 1 an après la
            fermeture de votre compte.
          </S>
          <S t="Vos droits">
            Accéder à vos données, les corriger, les supprimer ou les télécharger — tout cela depuis la page
            Paramètres.
          </S>
          <S t="Conformité">
            Mazed respecte la loi tunisienne sur la protection des données à caractère personnel et est
            enregistrée auprès de l'INPDP (Instance nationale de protection des données personnelles).
          </S>
          <S t="Cookies">
            Nous utilisons uniquement des cookies techniques nécessaires au fonctionnement de la plateforme.
            Aucun cookie publicitaire ou de suivi sans votre consentement explicite.
          </S>
          <S t="Contact">
            Pour toute question concernant la confidentialité, écrivez-nous à privacy@mazedauto.tn
          </S>
        </article>
      </div>
    </AppShell>
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

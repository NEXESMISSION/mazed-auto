import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import {
  ChevronDown,
  ChevronLeft,
  Gavel,
  KeyRound,
  LifeBuoy,
  Mail,
  Phone,
  ShieldCheck,
  Tag,
  Wallet,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Centre d'aide — Mazed Auto",
  description:
    "Questions fréquentes sur Mazed Auto : compte et vérification KYC, enchères et caution, paiements par virement ou D17, vente de votre voiture, remise du véhicule et support.",
};

// Pure static content — prerender at build and serve from the edge CDN.
export const dynamic = "force-static";

type Faq = { q: string; a: React.ReactNode };
type Group = {
  id: string;
  title: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  items: Faq[];
};

/* French copy is hardcoded on purpose — this page is content, not chrome. */
const GROUPS: Group[] = [
  {
    id: "compte-kyc",
    title: "Compte & KYC",
    Icon: ShieldCheck,
    items: [
      {
        q: "Comment créer un compte ?",
        a: (
          <>
            Rendez-vous sur la page{" "}
            <FaqLink href="/signup">Inscription</FaqLink>, renseignez vos
            informations et confirmez votre e-mail. La création du compte est
            gratuite et ne prend qu&apos;une minute.
          </>
        ),
      },
      {
        q: "Qu'est-ce que la vérification KYC et pourquoi est-elle obligatoire ?",
        a: (
          <>
            Le KYC (vérification d&apos;identité) garantit que chaque enchérisseur
            et chaque vendeur est une personne réelle et identifiée. Il vous sera
            demandé de photographier le <strong>recto et le verso de votre CIN</strong>{" "}
            puis de réaliser un <strong>selfie de vérification</strong> — le tout
            depuis votre téléphone, en deux minutes. Sans KYC validé, vous ne
            pouvez ni enchérir ni vendre.
          </>
        ),
      },
      {
        q: "Combien de temps prend la validation du KYC ?",
        a: (
          <>
            Notre équipe vérifie chaque dossier manuellement, généralement sous
            quelques heures ouvrées. Vous pouvez suivre l&apos;état de votre
            dossier à tout moment sur la page{" "}
            <FaqLink href="/kyc">Vérification</FaqLink> et vous serez notifié dès
            la validation.
          </>
        ),
      },
      {
        q: "Où gérer mes informations et mon activité ?",
        a: (
          <>
            Tout se passe dans votre espace{" "}
            <FaqLink href="/account">Compte</FaqLink> : vos offres en cours, vos
            lots remportés, vos paiements et vos favoris.
          </>
        ),
      },
    ],
  },
  {
    id: "encheres-caution",
    title: "Enchères & caution",
    Icon: Gavel,
    items: [
      {
        q: "Comment participer à une enchère ?",
        a: (
          <>
            Trois conditions : un compte, un KYC validé et une caution réglée
            pour le lot qui vous intéresse. Parcourez les{" "}
            <FaqLink href="/properties">voitures aux enchères</FaqLink>, ouvrez la
            fiche du lot et suivez le bouton d&apos;enchère — le détail des
            conditions (caution, pas d&apos;enchère, échéance) y est toujours
            affiché.
          </>
        ),
      },
      {
        q: "Qu'est-ce que la caution ?",
        a: (
          <>
            La caution est un montant <strong>remboursable</strong> qui sécurise
            l&apos;enchère : elle prouve le sérieux de chaque enchérisseur. Son
            montant est calculé sur le <strong>prix d&apos;ouverture</strong> du
            lot, selon les conditions fixées par la plateforme (elle peut être
            offerte sur certaines périodes ou certains lots). Elle n&apos;est
            bloquée qu&apos;<strong>une seule fois par enchère</strong>, quel que
            soit le nombre d&apos;offres que vous placez ensuite.
          </>
        ),
      },
      {
        q: "Que devient ma caution après l'enchère ?",
        a: (
          <>
            Si vous ne remportez pas le lot, elle vous est{" "}
            <strong>intégralement remboursée</strong> après la clôture définitive
            de l&apos;enchère (fenêtre légale de surenchère comprise). Si vous
            remportez le lot, elle est <strong>déduite du solde</strong> à régler.
            En cas de non-paiement du solde dans les délais, la caution peut être
            retenue.
          </>
        ),
      },
      {
        q: "Qu'est-ce que l'offre du sixième (surenchère légale) ?",
        a: (
          <>
            Conformément au droit tunisien, pendant <strong>8 jours</strong> après
            l&apos;adjudication provisoire, toute personne éligible peut déposer
            une surenchère d&apos;au moins <strong>un sixième (1/6)</strong> du
            prix adjugé. Si une telle offre est déposée, l&apos;enchère est
            rouverte. L&apos;adjudication ne devient définitive qu&apos;à la
            clôture de cette fenêtre.
          </>
        ),
      },
      {
        q: "Puis-je retirer une offre ?",
        a: (
          <>
            Non. Chaque offre est <strong>ferme et engageante</strong>. Vérifiez
            bien le montant avant de confirmer. Vous retrouvez l&apos;historique
            de vos offres dans{" "}
            <FaqLink href="/account/activity">votre activité</FaqLink>.
          </>
        ),
      },
    ],
  },
  {
    id: "paiements",
    title: "Paiements",
    Icon: Wallet,
    items: [
      {
        q: "Quels moyens de paiement acceptez-vous ?",
        a: (
          <>
            Deux moyens : le <strong>virement bancaire</strong> (vers le RIB
            affiché au moment du paiement) et <strong>D17</strong> (La Poste
            Tunisienne, vers le numéro affiché). Le paiement par carte en ligne
            n&apos;est pas proposé pour le moment.
          </>
        ),
      },
      {
        q: "Comment se déroule un paiement ?",
        a: (
          <>
            Vous effectuez le virement depuis votre banque (ou l&apos;envoi depuis
            votre application D17), puis vous téléversez une photo lisible du
            reçu — capture e-banking, avis d&apos;agence ou confirmation D17.
            Notre équipe vérifie chaque reçu <strong>manuellement</strong> et
            valide votre paiement, généralement sous quelques heures ouvrées.
          </>
        ),
      },
      {
        q: "Quand dois-je payer le solde d'un lot remporté ?",
        a: (
          <>
            Après l&apos;adjudication définitive (c&apos;est-à-dire une fois la
            fenêtre de surenchère du 1/6 refermée), le solde vous est présenté
            avec <strong>votre caution déjà déduite</strong>. Le délai de
            règlement est indiqué sur la page du lot et dans vos notifications.
          </>
        ),
      },
      {
        q: "Où suivre l'état de mes paiements ?",
        a: (
          <>
            Dans <FaqLink href="/account/payments">Compte → Paiements</FaqLink> :
            chaque paiement y apparaît avec son statut (en attente de
            validation, validé, remboursé).
          </>
        ),
      },
    ],
  },
  {
    id: "vendre",
    title: "Vendre",
    Icon: Tag,
    items: [
      {
        q: "Comment mettre ma voiture aux enchères ?",
        a: (
          <>
            Depuis la page <FaqLink href="/sell">Vendre</FaqLink> : décrivez le
            véhicule (marque, modèle, année, kilométrage…), ajoutez des photos de
            qualité et choisissez vos conditions de vente. Votre annonce est
            relue par notre équipe avant publication.
          </>
        ),
      },
      {
        q: "Y a-t-il des frais de mise en vente ?",
        a: (
          <>
            Les frais dépendent de la formule choisie et des options de mise en
            avant. Le détail est affiché avant toute confirmation, et nos offres
            professionnelles sont présentées sur la page{" "}
            <FaqLink href="/pricing">Tarifs Pro</FaqLink>.
          </>
        ),
      },
      {
        q: "Mon véhicule peut-il être inspecté ?",
        a: (
          <>
            Oui. Un inspecteur partenaire peut examiner le véhicule et publier un
            rapport sur la fiche du lot. Un lot inspecté inspire confiance et
            attire davantage d&apos;enchérisseurs.
          </>
        ),
      },
      {
        q: "Quand suis-je payé en tant que vendeur ?",
        a: (
          <>
            Une fois le paiement intégral de l&apos;acheteur validé par notre
            équipe et la remise du véhicule confirmée. Vous suivez chaque étape
            depuis votre espace <FaqLink href="/account">Compte</FaqLink>.
          </>
        ),
      },
    ],
  },
  {
    id: "remise",
    title: "Livraison / Remise",
    Icon: KeyRound,
    items: [
      {
        q: "Comment se passe la remise du véhicule ?",
        a: (
          <>
            La remise se fait <strong>en main propre</strong> entre le vendeur et
            l&apos;acheteur, une fois le paiement intégral validé. Les modalités
            (lieu, date) sont convenues entre les deux parties, avec
            l&apos;assistance de notre équipe si besoin.
          </>
        ),
      },
      {
        q: "Quels documents prévoir le jour de la remise ?",
        a: (
          <>
            Le vendeur apporte la carte grise et les documents du véhicule
            (vignette, assurance, visite technique le cas échéant) ; chaque
            partie se munit de sa CIN. Le transfert administratif (mutation)
            s&apos;effectue ensuite selon la réglementation en vigueur.
          </>
        ),
      },
      {
        q: "Proposez-vous une livraison à distance ?",
        a: (
          <>
            Pas de service de livraison intégré pour le moment : si
            l&apos;acheteur et le vendeur sont éloignés, le transport est convenu
            entre eux. Contactez le support si vous avez besoin de conseils pour
            organiser la remise.
          </>
        ),
      },
    ],
  },
  {
    id: "litiges-support",
    title: "Litiges & support",
    Icon: LifeBuoy,
    items: [
      {
        q: "J'ai un problème avec un lot ou un vendeur, que faire ?",
        a: (
          <>
            Contactez-nous via la page{" "}
            <FaqLink href="/contact">Contact</FaqLink> en précisant la référence
            du lot. Notre équipe examine chaque signalement et revient vers vous
            rapidement.
          </>
        ),
      },
      {
        q: "Ma caution n'a pas encore été remboursée, est-ce normal ?",
        a: (
          <>
            Les cautions restent bloquées tant que l&apos;enchère n&apos;est pas
            définitivement close — y compris pendant la fenêtre légale de
            surenchère (8 jours). Passé ce délai, le remboursement est traité par
            notre équipe. Si l&apos;attente vous semble anormale, écrivez-nous
            avec la référence du lot.
          </>
        ),
      },
      {
        q: "Comment signaler une annonce suspecte ?",
        a: (
          <>
            Envoyez-nous le lien de l&apos;annonce via la page{" "}
            <FaqLink href="/contact">Contact</FaqLink>. Toutes les annonces sont
            relues avant publication, mais chaque signalement est vérifié en
            priorité.
          </>
        ),
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-[var(--max-w)] px-5 py-6 lg:max-w-[var(--max-w-content)] lg:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted transition hover:text-gold-bright"
      >
        <ChevronLeft className="size-4" /> Accueil
      </Link>

      {/* Hero header — same pattern as the other content pages. */}
      <header className="mt-5">
        <span className="batta-eyebrow block">Aide</span>
        <h1 className="mt-1.5 text-[26px] font-extrabold leading-tight tracking-tight lg:text-[30px]">
          Centre d&apos;aide
        </h1>
        <p className="mt-1.5 max-w-prose text-[13.5px] leading-relaxed text-muted">
          Tout ce que vous devez savoir sur Mazed Auto : compte, enchères,
          caution, paiements et remise du véhicule.
        </p>
      </header>

      {/* FAQ groups — native <details>, zero client JS. */}
      <div className="mt-7 space-y-7">
        {GROUPS.map((g) => (
          <section key={g.id} aria-labelledby={`faq-${g.id}`}>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold-faint text-gold ring-1 ring-gold/30">
                <g.Icon className="size-4" strokeWidth={2} />
              </span>
              <h2
                id={`faq-${g.id}`}
                className="text-[15px] font-extrabold tracking-tight"
              >
                {g.title}
              </h2>
            </div>
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
              {g.items.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                    <span className="flex-1 text-[13.5px] font-semibold text-foreground">
                      {f.q}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 text-[13px] leading-relaxed text-muted">
                    {f.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Contact CTA */}
      <section
        aria-label="Contacter le support"
        className="mt-8 rounded-2xl bg-surface p-5 ring-1 ring-border lg:p-6"
      >
        <h2 className="text-[15px] font-extrabold tracking-tight">
          Vous n&apos;avez pas trouvé de réponse ?
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Notre équipe répond du lundi au vendredi, de 9h à 17h.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Link
            href="/contact"
            className="batta-gold-fill inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-extrabold uppercase tracking-wider shadow-[var(--shadow-gold)] transition active:scale-95"
          >
            <LifeBuoy className="size-4" strokeWidth={2.2} />
            Contactez-nous
          </Link>
          <a
            href="mailto:contact@mazed.tn"
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-[12px] font-bold text-foreground ring-1 ring-border transition hover:ring-gold-soft/60"
          >
            <Mail className="size-4 text-gold" strokeWidth={2} />
            contact@mazed.tn
          </a>
          <a
            href="tel:+21670000000"
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-[12px] font-bold text-foreground ring-1 ring-border transition hover:ring-gold-soft/60"
          >
            <Phone className="size-4 text-gold" strokeWidth={2} />
            +216 70 000 000
          </a>
        </div>
      </section>
    </div>
  );
}

/** Inline gold link used inside FAQ answers. */
function FaqLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-semibold text-gold underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

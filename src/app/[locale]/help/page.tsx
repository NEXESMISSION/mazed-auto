import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import {
  ChevronDown,
  ChevronLeft,
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
    "Questions fréquentes sur Mazed Auto : acheter au prix affiché, contacter le vendeur, publier une annonce, frais de publication, pièces de rechange et support.",
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
    id: "compte",
    title: "Compte",
    Icon: ShieldCheck,
    items: [
      {
        q: "Comment créer un compte ?",
        a: (
          <>
            Avec votre numéro de téléphone : vous recevez un code par SMS et
            votre compte est créé. Un compte est nécessaire pour publier une
            annonce ou enregistrer des favoris — pas pour parcourir le catalogue
            ni pour appeler un vendeur.
          </>
        ),
      },
      {
        q: "Dois-je vérifier mon identité pour utiliser Mazed Auto ?",
        a: (
          <>
            Non. Il n&apos;y a plus de vérification d&apos;identité à passer :
            ce que nous vérifions, c&apos;est <strong>l&apos;annonce</strong>,
            avant qu&apos;elle soit publiée. Les vendeurs professionnels peuvent
            en plus obtenir le badge <strong>Vendeur vérifié</strong>, que nous
            accordons à la main après contrôle.
          </>
        ),
      },
      {
        q: "Où retrouver mes annonces et mes favoris ?",
        a: (
          <>
            Vos annonces sont dans{" "}
            <FaqLink href="/account/listings">Mes annonces</FaqLink> (statut,
            date d&apos;expiration, renouvellement) et les annonces que vous avez
            enregistrées dans{" "}
            <FaqLink href="/account/favoris">Favoris</FaqLink>.
          </>
        ),
      },
    ],
  },
  {
    id: "acheter",
    title: "Acheter",
    Icon: Tag,
    items: [
      {
        q: "Comment se passe un achat ?",
        a: (
          <>
            Le prix est affiché sur l&apos;annonce : il n&apos;y a ni enchère ni
            délai. Vous affichez le numéro du vendeur, vous l&apos;appelez, vous
            voyez le véhicule et vous convenez du prix entre vous.{" "}
            <strong>Mazed Auto n&apos;intervient pas dans la transaction</strong>{" "}
            et ne touche rien sur la vente.
          </>
        ),
      },
      {
        q: "Dois-je payer quelque chose pour acheter ?",
        a: (
          <>
            Non. Parcourir les annonces, afficher un numéro et contacter un
            vendeur sont gratuits. Le seul paiement sur la plateforme est celui
            de la <strong>publication</strong>, réglé par le vendeur.
          </>
        ),
      },
      {
        q: "Que veut dire le badge « Vérifié et approuvé » ?",
        a: (
          <>
            Que <strong>nous avons inspecté ce véhicule nous-mêmes</strong>. La
            fiche de diagnostic publiée sur l&apos;annonce détaille ce que nous
            avons constaté, point par point, photos à l&apos;appui. Une annonce
            sans ce badge n&apos;a pas été inspectée par nos équipes — elle a
            seulement été relue avant publication.
          </>
        ),
      },
      {
        q: "Comment trouver une pièce compatible avec ma voiture ?",
        a: (
          <>
            Dans{" "}
            <FaqLink href="/annonces?kind=part">Pièces de rechange</FaqLink>,
            indiquez votre marque, votre modèle et votre année : seules les
            pièces déclarées compatibles avec ce véhicule s&apos;affichent.
            Vérifiez tout de même la référence avec le vendeur avant de vous
            déplacer.
          </>
        ),
      },
      {
        q: "Le vendeur ne répond pas, que faire ?",
        a: (
          <>
            Réessayez à un autre moment, puis signalez-nous l&apos;annonce via la
            page <FaqLink href="/contact">Contact</FaqLink>. Un numéro qui ne
            répond jamais est un motif de retrait.
          </>
        ),
      },
    ],
  },
  {
    id: "vendre",
    title: "Vendre",
    Icon: Wallet,
    items: [
      {
        q: "Comment publier une annonce ?",
        a: (
          <>
            Depuis{" "}
            <FaqLink href="/annonces/nouvelle">Publier une annonce</FaqLink> :
            catégorie, photos, caractéristiques, prix et vos coordonnées. Vous
            signez une attestation sur l&apos;exactitude des informations, vous
            réglez la publication, puis notre équipe vérifie l&apos;annonce avant
            de la mettre en ligne.
          </>
        ),
      },
      {
        q: "Combien coûte une publication ?",
        a: (
          <>
            Un montant fixe par annonce, affiché au moment de publier — le prix
            peut différer selon la catégorie. Les{" "}
            <strong>pièces de rechange sont gratuites</strong>. Si vous publiez
            beaucoup, des forfaits permettent d&apos;acheter plusieurs
            publications d&apos;avance ; écrivez-nous pour en obtenir un.
          </>
        ),
      },
      {
        q: "Pourquoi mes coordonnées apparaissent-elles sur l'annonce ?",
        a: (
          <>
            Parce que nous sommes l&apos;intermédiaire, pas le vendeur : les
            acheteurs vous appellent directement et vous traitez avec qui vous
            voulez. Le numéro n&apos;est affiché qu&apos;après une action de
            l&apos;acheteur, pour limiter la collecte automatisée.
          </>
        ),
      },
      {
        q: "Combien de temps mon annonce reste-t-elle en ligne ?",
        a: (
          <>
            <strong>30 jours.</strong> Nous vous prévenons avant
            l&apos;expiration, et une annonce expirée se renouvelle depuis{" "}
            <FaqLink href="/account/listings">Mes annonces</FaqLink>. Une durée
            limitée évite que le catalogue se remplisse de voitures vendues
            depuis longtemps.
          </>
        ),
      },
      {
        q: "Mon annonce a été refusée, pourquoi ?",
        a: (
          <>
            Le motif vous est envoyé et s&apos;affiche sur l&apos;annonce :
            photos inexploitables, informations contradictoires, numéro
            injoignable, doublon. Corrigez et renvoyez-la —{" "}
            <strong>un refus ne consomme pas votre publication</strong>, elle
            vous est rendue.
          </>
        ),
      },
      {
        q: "Que se passe-t-il si je déclare quelque chose de faux ?",
        a: (
          <>
            En publiant, vous attestez que les informations sont exactes. Une
            fausse déclaration nous autorise à retirer l&apos;annonce et à
            conserver les frais déjà réglés — et l&apos;acheteur reste en droit
            de se retourner contre vous.
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
            Pour les frais de publication : virement bancaire et D17. Vous
            téléversez le reçu, et l&apos;annonce part en vérification dès que
            notre équipe l&apos;a validé.
          </>
        ),
      },
      {
        q: "Le prix de la voiture passe-t-il par Mazed Auto ?",
        a: (
          <>
            <strong>Non, jamais.</strong> Le paiement du véhicule se règle
            directement entre l&apos;acheteur et le vendeur. Nous ne détenons
            aucun fonds et ne prenons aucune commission sur la vente.
          </>
        ),
      },
      {
        q: "Puis-je obtenir une facture ?",
        a: (
          <>
            Oui, pour les frais de publication. Vos paiements sont listés dans{" "}
            <FaqLink href="/account/payments">Mes paiements</FaqLink> ;
            demandez la facture via la page{" "}
            <FaqLink href="/contact">Contact</FaqLink>.
          </>
        ),
      },
    ],
  },
  {
    id: "remise",
    title: "Rendez-vous & remise",
    Icon: KeyRound,
    items: [
      {
        q: "Comment se passe la remise du véhicule ?",
        a: (
          <>
            En main propre, entre le vendeur et l&apos;acheteur, aux conditions
            qu&apos;ils fixent ensemble. Voyez le véhicule avant de payer quoi
            que ce soit, et privilégiez un lieu public en journée.
          </>
        ),
      },
      {
        q: "Quels documents prévoir ?",
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
        q: "Proposez-vous la livraison ?",
        a: (
          <>
            Non. Si l&apos;acheteur et le vendeur sont éloignés, le transport se
            convient entre eux.
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
        q: "J'ai un problème avec une annonce ou un vendeur, que faire ?",
        a: (
          <>
            Contactez-nous via la page{" "}
            <FaqLink href="/contact">Contact</FaqLink> avec le lien de
            l&apos;annonce. Nous examinons chaque signalement et retirons ce qui
            doit l&apos;être.
          </>
        ),
      },
      {
        q: "L'annonce ne correspond pas au véhicule que j'ai vu.",
        a: (
          <>
            Signalez-la : le vendeur a attesté de l&apos;exactitude de sa
            description, et un écart avéré entraîne le retrait de
            l&apos;annonce. Comme la vente se règle directement entre vous,
            n&apos;engagez aucun paiement tant que le véhicule ne correspond pas
            à ce qui est annoncé.
          </>
        ),
      },
      {
        q: "Comment signaler une annonce suspecte ?",
        a: (
          <>
            Envoyez-nous son lien via la page{" "}
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
          Tout ce que vous devez savoir sur Mazed Auto : compte,
          achat, publication d&apos;annonces, paiements et remise du véhicule.
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

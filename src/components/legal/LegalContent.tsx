import { useTranslations } from "next-intl";

/**
 * Shared legal copy — rendered on the standalone /terms and /privacy pages
 * AND inside the signup modal, so there's a single source of truth. Plain
 * presentational components usable from server or client: the text lives in
 * the `legal` messages, which the signup route sends to the browser for the
 * modal (src/app/[locale]/signup/layout.tsx).
 *
 * The text describes the site as it works now — classifieds at a shown price,
 * the buyer calls the seller, every annonce read before it goes live — and was
 * approved by the owner on 2026-10-26 in both languages. It is not a
 * substitute for a lawyer's review.
 *
 * 2026-10-27, published at the owner's request: an annonce lasts the duration
 * the Tarifs page shows (a setting now, D-B5), and § 8 says how a shop's one
 * subscription is renewed, upgraded, downgraded and cancelled (0198).
 */

/** The date the privacy policy last changed, shown under its title. */
export const LEGAL_UPDATED = "2026-10-26";

/** The date the terms of use last changed, shown under their title. */
export const TERMS_UPDATED = "2026-10-27";

type Part = { id: string; paragraphs?: readonly string[]; items?: readonly string[] };

const TERMS: readonly Part[] = [
  { id: "s1" }, { id: "s2" }, { id: "s3" },
  { id: "s4", paragraphs: ["body", "body2"] },
  { id: "s5" }, { id: "s6" }, { id: "s7" }, { id: "s8", paragraphs: ["body", "body2"] }, { id: "s9" },
  { id: "s10" }, { id: "s11" }, { id: "s12" },
];

const PRIVACY: readonly Part[] = [
  { id: "s1" },
  { id: "s2", paragraphs: [], items: ["account", "listings", "shops", "payments", "usage"] },
  { id: "s3" }, { id: "s4" }, { id: "s5" }, { id: "s6" }, { id: "s7" }, { id: "s8" }, { id: "s9" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="text-[15px] font-bold text-foreground">{title}</h3>
      <div className="mt-1.5 space-y-2 text-[13.5px] leading-relaxed text-foreground/80">
        {children}
      </div>
    </section>
  );
}

function Parts({ parts, t }: { parts: readonly Part[]; t: (key: string) => string }) {
  return (
    <div>
      {parts.map(({ id, paragraphs = ["body"], items }) => (
        <Section key={id} title={t(`${id}.title`)}>
          {paragraphs.map((p) => <p key={p}>{t(`${id}.${p}`)}</p>)}
          {items && (
            <ul className="list-disc space-y-1.5 ps-5">
              {items.map((i) => <li key={i}>{t(`${id}.items.${i}`)}</li>)}
            </ul>
          )}
        </Section>
      ))}
    </div>
  );
}

export function TermsContent() {
  const t = useTranslations("legal.terms");
  return <Parts parts={TERMS} t={t} />;
}

export function PrivacyContent() {
  const t = useTranslations("legal.privacy");
  return <Parts parts={PRIVACY} t={t} />;
}

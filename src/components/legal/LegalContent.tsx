import { useTranslations } from "next-intl";

/**
 * Shared legal copy — rendered on the standalone /terms and /privacy pages
 * AND inside the signup modal, so there's a single source of truth. Plain
 * presentational components usable from server or client: the text lives in
 * the `legal` messages, which the signup route sends to the browser for the
 * modal (src/app/[locale]/signup/layout.tsx).
 *
 * This is general informational copy for the Mazed Auto marketplace, not a
 * substitute for legal review before launch.
 */

const TERMS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"] as const;
const PRIVACY = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;

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

export function TermsContent() {
  const t = useTranslations("legal.terms");
  return (
    <div>
      {TERMS.map((s) => (
        <Section key={s} title={t(`${s}.title`)}>
          <p>{t(`${s}.body`)}</p>
        </Section>
      ))}
    </div>
  );
}

export function PrivacyContent() {
  const t = useTranslations("legal.privacy");
  return (
    <div>
      {PRIVACY.map((s) => (
        <Section key={s} title={t(`${s}.title`)}>
          <p>{t(`${s}.body`)}</p>
        </Section>
      ))}
    </div>
  );
}

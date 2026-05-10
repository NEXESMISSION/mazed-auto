import { getLocale } from "next-intl/server";
import { MessageSquare, Mail, Phone } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCmsFaqs } from "@/lib/cms";
import { FaqList } from "./FaqList";

// Static defaults — used when the CMS table is empty (fresh install
// or the migration hasn't been run). Once the admin edits anything in
// /admin/cms/faqs the DB takes over.
const FALLBACK_FAQS = [
  {
    q: "Comment commencer en tant que vendeur ?",
    a: "Créez un compte, terminez le KYC (deux minutes), puis cliquez sur '+ Nouvelle enchère' pour suivre les 5 étapes.",
  },
];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HelpPage() {
  const locale = await getLocale();
  const supabase = await createClient();
  const dbFaqs = await listCmsFaqs(supabase);

  const items =
    dbFaqs.length > 0
      ? dbFaqs.map((f) => ({
          q:
            (locale === "ar" ? f.questionAr : f.questionFr) ?? f.questionFr,
          a: (locale === "ar" ? f.answerAr : f.answerFr) ?? f.answerFr,
        }))
      : FALLBACK_FAQS;

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] lg:max-w-[var(--max-w-content)] mx-auto px-4 py-8 md:py-12 space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-[26px] font-extrabold tracking-tight">
            Centre d&apos;aide
          </h1>
          <p className="text-[var(--foreground-muted)]">
            Tout ce que vous devez savoir sur Mazed Auto
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="font-bold text-lg">Questions fréquentes</h2>
          <FaqList items={items} />
        </section>

        <section className="space-y-2">
          <h2 className="font-bold text-lg">
            Vous n&apos;avez pas trouvé de réponse ? Contactez-nous
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ContactCard
              icon={<MessageSquare className="h-5 w-5" />}
              title="Chat en direct"
              text="9h - 18h, 7j/7"
              action="Démarrer le chat"
            />
            <ContactCard
              icon={<Mail className="h-5 w-5" />}
              title="E-mail"
              text="support@mazedauto.tn"
              action="Nous écrire"
            />
            <ContactCard
              icon={<Phone className="h-5 w-5" />}
              title="Téléphone"
              text="+216 70 100 200"
              action="Appeler"
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ContactCard({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 hover:border-[var(--gold)] transition-colors">
      <div className="h-10 w-10 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] flex items-center justify-center mb-3">
        {icon}
      </div>
      <div className="font-bold text-sm">{title}</div>
      <div className="text-xs text-[var(--foreground-muted)] mt-0.5">{text}</div>
      <Link
        href="#"
        className="inline-block mt-2 text-xs text-[var(--gold)] font-semibold hover:underline"
      >
        {action} ←
      </Link>
    </div>
  );
}

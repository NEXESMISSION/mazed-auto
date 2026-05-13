import { Mail, Phone, MapPin } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  getSupportEmail,
  getSupportPhone,
  getSupportAddress,
} from "@/lib/config";
import { ContactForm } from "./ContactForm";

/**
 * Contact page (server component). Reads support channel info from
 * platform_settings via lib/config (server-only) and hands the static
 * header + channel grid + AppShell layout to the user; the actual
 * form is a client island in ContactForm so the boundary is clean.
 *
 * Splitting this way fixes the Turbopack build error that was tripping
 * the prod deploy — when contact/page.tsx was "use client" + imported
 * AppShell, the next/headers chain (config → supabase/server) leaked
 * into the client bundle.
 */
export default async function ContactPage() {
  const [email, phone, address] = await Promise.all([
    getSupportEmail(),
    getSupportPhone(),
    getSupportAddress(),
  ]);

  // Strip non-digits for the tel: href so "+216 70 100 200" works on a
  // dialer even when admins enter it with spaces. Keep the formatted
  // version for display.
  const telHref = `tel:${phone.replace(/\s+/g, "")}`;

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] lg:max-w-[var(--max-w-content)] mx-auto px-4 py-8 md:py-12 space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-[26px] font-extrabold tracking-tight leading-tight">
            Nous <span className="gradient-gold-text">contacter</span>
          </h1>
          <p className="text-[var(--foreground-muted)]">
            Notre équipe est prête à répondre à vos questions. Temps de réponse moyen : moins de 4 heures.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Channel
            icon={<Mail className="h-5 w-5" />}
            title="E-mail"
            value={email}
            href={`mailto:${email}`}
          />
          <Channel
            icon={<Phone className="h-5 w-5" />}
            title="Téléphone"
            value={phone}
            href={telHref}
          />
          <Channel
            icon={<MapPin className="h-5 w-5" />}
            title="Siège"
            value="Tunis Capitale"
            sub={address}
          />
        </section>

        <ContactForm />
      </div>
    </AppShell>
  );
}

function Channel({
  icon,
  title,
  value,
  sub,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 hover:border-[var(--gold)] transition-colors h-full">
      <div className="h-10 w-10 rounded-full bg-[var(--gold-faint)] text-[var(--gold)] flex items-center justify-center mb-3">
        {icon}
      </div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--foreground-muted)]">
        {title}
      </div>
      <div className="font-bold text-sm mt-0.5">{value}</div>
      {sub && (
        <div className="text-xs text-[var(--foreground-muted)] mt-0.5">{sub}</div>
      )}
    </div>
  );
  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }
  return content;
}

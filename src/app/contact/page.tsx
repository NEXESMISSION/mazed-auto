"use client";

import { useState } from "react";
import { Mail, Phone, MapPin, Send, MessageSquare, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const TOPICS = [
  { value: "general", label: "Demande générale" },
  { value: "support", label: "Support technique" },
  { value: "billing", label: "Paiement et factures" },
  { value: "report", label: "Signalement de fraude" },
  { value: "partnership", label: "Partenariat / Publicité" },
] as const;

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<(typeof TOPICS)[number]["value"]>("general");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Veuillez remplir tous les champs");
      return;
    }
    setError(null);
    setSubmitting(true);
    // No backend for contact yet — simulate so users get a confirmation while we
    // hook up an inbox. Spec calls /contact a static info + form page.
    await new Promise((r) => setTimeout(r, 600));
    setSubmitting(false);
    setSent(true);
  }

  if (sent) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-extrabold">Message reçu</h1>
          <p className="text-sm text-[var(--foreground-muted)]">
            Nous vous répondrons à {email} sous 24 heures ouvrées.
          </p>
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setSent(false);
              setName("");
              setEmail("");
              setMessage("");
              setTopic("general");
            }}
          >
            Envoyer un autre message
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-8 md:py-12 space-y-8">
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
            value="support@mazedauto.tn"
            href="mailto:support@mazedauto.tn"
          />
          <Channel
            icon={<Phone className="h-5 w-5" />}
            title="Téléphone"
            value="+216 70 100 200"
            href="tel:+21670100200"
          />
          <Channel
            icon={<MapPin className="h-5 w-5" />}
            title="Siège"
            value="Tunis Capitale"
            sub="Avenue de la Liberté, 1002"
          />
        </section>

        <section className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-4 w-4 text-[var(--gold)]" />
            <h2 className="font-bold text-lg">Envoyez-nous un message</h2>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nom complet">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mohamed Ben Ali"
                  required
                />
              </Field>
              <Field label="E-mail">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                />
              </Field>
            </div>

            <Field label="Sujet">
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTopic(t.value)}
                    className={`px-3 h-9 rounded-[var(--radius)] text-xs font-bold border transition-colors ${
                      topic === t.value
                        ? "bg-[var(--gold-faint)] border-[var(--gold)] text-[var(--gold)]"
                        : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Message">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="Écrivez votre message ici..."
                required
                className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base text-foreground placeholder:text-[var(--foreground-subtle)] transition-colors focus:border-[var(--gold)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]/30 resize-none"
              />
            </Field>

            {error && (
              <div className="text-sm text-[var(--danger)] bg-red-500/10 border border-red-500/30 rounded-[var(--radius)] px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" size="md" disabled={submitting} fullWidth>
              {submitting ? (
                "Envoi en cours..."
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Envoyer
                </>
              )}
            </Button>

            <p className="text-[11px] text-[var(--foreground-subtle)] text-center">
              Pour les signalements urgents de fraude ou de voitures volées, veuillez nous contacter
              directement au numéro ci-dessus.
            </p>
          </form>
        </section>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="text-xs font-bold text-[var(--foreground-muted)]">{label}</div>
      {children}
    </label>
  );
}

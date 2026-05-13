"use client";

import { useState } from "react";
import { Send, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";

const TOPICS = [
  { value: "general", label: "Demande générale" },
  { value: "support", label: "Support technique" },
  { value: "billing", label: "Paiement et factures" },
  { value: "report", label: "Signalement de fraude" },
  { value: "partnership", label: "Partenariat / Publicité" },
] as const;

/**
 * Client-only form for /contact. Split out of contact/page.tsx so the
 * page itself can be a server component that wraps <AppShell> — which
 * needs to be a server component because it imports lib/config.ts
 * (server-only, reads platform_settings via next/headers cookies).
 *
 * Mixing "use client" + AppShell in one file pulls the server-only
 * config + supabase/server modules into the client bundle and the
 * production build fails. Keep the boundary clean here.
 */
export function ContactForm() {
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
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { error: insertErr } = await supabase
      .from("contact_messages")
      .insert({
        name: name.trim(),
        email: email.trim(),
        topic,
        body: message.trim(),
        user_id: auth?.user?.id ?? null,
      });
    setSubmitting(false);
    if (insertErr) {
      setError("Impossible d'envoyer le message. Réessayez plus tard.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
          {/* Reusing Send icon as a "sent" visual; rotation tilts it
              into a paper-airplane "delivered" feel. */}
          <Send className="h-7 w-7 -rotate-12" />
        </div>
        <h2 className="text-2xl font-extrabold">Message reçu</h2>
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
    );
  }

  return (
    <section className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-4 w-4 text-[var(--gold)]" />
        <h2 className="font-bold text-lg">Envoyez-nous un message</h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nom complet" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mohamed Ben Ali"
              required
            />
          </Field>
          <Field label="E-mail" required>
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

        <Field label="Message" required>
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

        <Button
          type="submit"
          size="md"
          // Block submit until all required fields have content so
          // the user gets visual feedback that the form is incomplete
          // (rather than clicking and seeing the "Veuillez remplir..."
          // error appear under the form).
          disabled={
            submitting ||
            !name.trim() ||
            !email.trim() ||
            !message.trim()
          }
          fullWidth
        >
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
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="text-xs font-bold text-[var(--foreground-muted)] inline-flex items-center gap-1">
        {label}
        {required && (
          <span aria-hidden className="text-[var(--danger)]">
            *
          </span>
        )}
      </div>
      {children}
    </label>
  );
}

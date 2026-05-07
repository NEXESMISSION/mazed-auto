"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Mail, ArrowRight } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      toast("Saisissez votre e-mail", "warning");
      return;
    }
    setLoading(true);
    const { error } = await sendPasswordReset(email);
    setLoading(false);
    if (error) {
      toast("Échec de l'envoi de l'e-mail", "error");
      return;
    }
    setSent(true);
  }

  return (
    <AuthShell
      title="Mot de passe oublié ?"
      subtitle={
        sent
          ? "Vérifiez votre boîte e-mail"
          : "Saisissez votre e-mail et nous vous enverrons un lien pour réinitialiser le mot de passe"
      }
      footer={
        <Link
          href="/login"
          className="text-[var(--gold)] font-semibold hover:underline"
        >
          Retour à Se connecter
        </Link>
      }
    >
      {sent ? (
        <div className="text-center space-y-4 py-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-[var(--gold-faint)] flex items-center justify-center">
            <Mail className="h-6 w-6 text-[var(--gold)]" />
          </div>
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
            Nous avons envoyé un lien à <strong className="text-foreground">{email}</strong>
            <br />
            Ouvrez votre e-mail pour réinitialiser le mot de passe.
          </p>
          <Button
            variant="ghost"
            size="md"
            onClick={() => setSent(false)}
            fullWidth
          >
            Utiliser un autre e-mail
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            iconLeft={<Mail className="h-4 w-4" />}
          />
          <Button type="submit" size="lg" fullWidth disabled={loading}>
            {loading ? "Envoi en cours..." : "Envoyer le lien"}
            {!loading && <ArrowRight className="h-5 w-5" />}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

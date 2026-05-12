"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { Mail, RefreshCw } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";

export default function VerifyEmailPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loaded, resendEmailVerification } = useAuth();
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    if (loaded && user?.emailVerified) {
      router.push("/kyc/start");
    }
  }, [loaded, user, router]);

  async function resend() {
    if (!user?.email) {
      toast("Nous n'avons pas trouvé votre e-mail — veuillez vous réinscrire", "error");
      return;
    }
    setSending(true);
    const { error } = await resendEmailVerification(user.email);
    setSending(false);
    if (error) {
      toast("Échec de l'envoi de l'e-mail", "error");
      return;
    }
    setCooldown(60);
    toast("E-mail envoyé", "info");
  }

  return (
    <AuthShell
      title="Vérifiez votre boîte e-mail"
      subtitle={`Nous avons envoyé un lien de confirmation à ${user?.email || "votre e-mail"}`}
    >
      <div className="space-y-6">
        <div className="mx-auto h-16 w-16 rounded-full bg-[var(--gold-faint)] flex items-center justify-center">
          <Mail className="h-7 w-7 text-[var(--gold)]" />
        </div>

        <div className="rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border)] p-4">
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed text-center">
            Ouvrez votre e-mail et cliquez sur le lien pour confirmer votre compte. L&apos;e-mail peut arriver
            dans les spams. Vous serez redirigé automatiquement après la confirmation.
          </p>
        </div>

        <Button
          size="lg"
          fullWidth
          variant="secondary"
          onClick={resend}
          disabled={cooldown > 0 || sending}
        >
          <RefreshCw className="h-5 w-5" />
          {sending
            ? "Envoi en cours..."
            : cooldown > 0
              ? `Renvoyer dans ${cooldown}s`
              : "Renvoyer l'e-mail"}
        </Button>

        <div className="text-center text-sm text-[var(--foreground-muted)]">
          Vous avez terminé ?{" "}
          <button
            onClick={() => router.refresh()}
            className="text-[var(--gold)] font-semibold hover:underline"
          >
            Actualiser maintenant
          </button>
        </div>
      </div>
    </AuthShell>
  );
}

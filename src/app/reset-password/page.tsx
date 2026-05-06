"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

type SessionState = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<SessionState>("checking");

  // Supabase exchanges the recovery token from the URL hash on mount and either
  // emits a PASSWORD_RECOVERY event or sets a session. Block submission until
  // we've actually got that — otherwise updatePassword silently no-ops because
  // there's no authenticated user to update.
  useEffect(() => {
    const supabase = createClient();
    let resolved = false;

    const sub = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY" || s) {
        resolved = true;
        setSession("ready");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        resolved = true;
        setSession("ready");
      }
    });

    // Give the URL exchange a moment; if nothing landed, the link was bad.
    const t = setTimeout(() => {
      if (!resolved) setSession("invalid");
    }, 1500);

    return () => {
      sub.data.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (session !== "ready") return;
    if (password.length < 8) {
      toast("Le mot de passe doit comporter au moins 8 caractères", "warning");
      return;
    }
    if (password !== confirm) {
      toast("Les mots de passe ne correspondent pas", "warning");
      return;
    }
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) {
      toast("Échec de la mise à jour du mot de passe — le lien est peut-être expiré", "error");
      return;
    }
    setDone(true);
    toast("Mot de passe mis à jour", "success");
    setTimeout(() => router.push("/"), 1200);
  }

  const subtitle = done
    ? "Effectué avec succès — Redirection..."
    : session === "invalid"
      ? "Le lien est invalide ou expiré"
      : "Saisissez un nouveau mot de passe pour votre compte";

  return (
    <AuthShell
      title="Réinitialiser le mot de passe"
      subtitle={subtitle}
      footer={
        <Link
          href="/login"
          className="text-[var(--gold)] font-semibold hover:underline"
        >
          Retour à Se connecter
        </Link>
      }
    >
      {done ? (
        <div className="text-center space-y-4 py-6">
          <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7 text-emerald-400" />
          </div>
          <p className="text-sm text-[var(--foreground-muted)]">
            Vous pouvez maintenant utiliser le nouveau mot de passe pour vous connecter.
          </p>
        </div>
      ) : session === "invalid" ? (
        <div className="text-center space-y-4 py-6">
          <div className="mx-auto h-14 w-14 rounded-full bg-amber-500/15 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-amber-400" />
          </div>
          <p className="text-sm text-[var(--foreground-muted)]">
            Le lien de réinitialisation est expiré ou a déjà été utilisé. Demandez un nouveau lien.
          </p>
          <Link href="/forgot-password" className="block">
            <Button size="md" fullWidth>
              Demander un nouveau lien
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--foreground-muted)]">
Nouveau mot de passe
            </label>
            <Input
              type="password"
              placeholder="8 caractères minimum"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              iconLeft={<Lock className="h-4 w-4" />}
              autoComplete="new-password"
              disabled={session !== "ready"}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--foreground-muted)]">
Confirmer le mot de passe
            </label>
            <Input
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              iconLeft={<Lock className="h-4 w-4" />}
              autoComplete="new-password"
              disabled={session !== "ready"}
            />
          </div>
          <Button
            type="submit"
            size="lg"
            fullWidth
            disabled={loading || session !== "ready"}
          >
            {session === "checking"
              ? "Vérification du lien..."
              : loading
                ? "Mise à jour..."
                : "Mettre à jour"}
            {!loading && session === "ready" && (
              <ArrowRight className="h-5 w-5" />
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

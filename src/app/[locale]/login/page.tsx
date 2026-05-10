"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { useSearchParams, useParams } from "next/navigation";
import { stripLocalePrefix } from "@/i18n/routing";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";

function LoginForm() {
  const params = useSearchParams();
  const routeParams = useParams<{ locale: string }>();
  const { toast } = useToast();
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Surface auth-callback failures from /auth/callback. Without this,
  // the user lands silently on /login after a failed OAuth exchange
  // with no idea why — they assume the app is broken. The callback
  // route now puts the underlying message in `?error=...` and we
  // toast it once on mount (guarded against React StrictMode
  // double-effect via a ref).
  const errorParam = params.get("error");
  const errorShownRef = useRef<string | null>(null);
  useEffect(() => {
    if (!errorParam || errorShownRef.current === errorParam) return;
    errorShownRef.current = errorParam;
    const friendly =
      errorParam === "callback"
        ? "La connexion via le fournisseur externe a échoué. Réessayez."
        : `Échec de l'authentification : ${decodeURIComponent(errorParam)}`;
    toast(friendly, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorParam]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast("Remplissez tous les champs", "warning");
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      setLoading(false);
      const msg =
        error.message === "Invalid login credentials"
          ? "E-mail ou mot de passe incorrect"
          : error.message === "Email not confirmed"
            ? "Veuillez d'abord confirmer votre e-mail"
            : "Échec de la connexion, veuillez réessayer";
      toast(msg, "error");
      return;
    }
    // Hard nav so the auth cookie is guaranteed picked up by middleware on
    // the destination request — router.push + refresh used to land on the
    // protected page before the cookie propagated, flashing a momentary
    // unauthed error toast even on successful login.
    const stripped = stripLocalePrefix(params.get("redirect") || "/");
    const locale = routeParams?.locale ?? "fr";
    const target =
      stripped === "/" ? `/${locale}` : `/${locale}${stripped}`;
    window.location.assign(target);
  }

  async function handleGoogle() {
    setLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      toast("Échec de la connexion à Google", "error");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[var(--foreground-muted)]">
          E-mail
        </label>
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          iconLeft={<Mail className="h-4 w-4" />}
          autoComplete="email"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-[var(--foreground-muted)]">
            Mot de passe
          </label>
          <Link
            href="/forgot-password"
            className="text-xs text-[var(--gold)] hover:underline"
          >
            Mot de passe oublié ?
          </Link>
        </div>
        <Input
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          iconLeft={<Lock className="h-4 w-4" />}
          autoComplete="current-password"
        />
      </div>

      <Button type="submit" size="lg" fullWidth disabled={loading}>
        {loading ? "Connexion en cours..." : "Connexion"}
        {!loading && <ArrowRight className="h-5 w-5" />}
      </Button>

      <div className="relative my-3">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--border)]" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-[var(--surface)] px-3 text-[var(--foreground-muted)]">
            ou
          </span>
        </div>
      </div>

      <Button
        type="button"
        variant="secondary"
        size="lg"
        fullWidth
        onClick={handleGoogle}
        disabled={loading}
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.84z" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
        </svg>
        Continuer avec Google
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Bon retour"
      subtitle="Connectez-vous pour continuer"
      footer={
        <>
          Vous n'avez pas de compte ?{" "}
          <Link
            href="/register"
            className="text-[var(--gold)] font-semibold hover:underline"
          >
Créer un compte
          </Link>
        </>
      }
    >
      <Suspense fallback={<div className="text-center py-8">Chargement...</div>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}

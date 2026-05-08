"use client";

import { useState, Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { useSearchParams, useParams } from "next/navigation";
import { Mail, Lock, User, Phone, ArrowRight } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { useToast } from "@/components/ui/Toast";
import { LegalLink } from "@/components/legal/LegalLink";
import { useAuth } from "@/lib/auth";
import { scrollToFirstInvalid } from "@/lib/validation";

function RegisterForm() {
  const params = useSearchParams();
  const routeParams = useParams<{ locale: string }>();
  const { toast } = useToast();
  const { signUp, signInWithGoogle } = useAuth();
  const [data, setData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const role = (params.get("role") as "buyer" | "seller") || "buyer";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing = (Object.keys(data) as (keyof typeof data)[]).filter(
      (k) => !data[k],
    );
    if (missing.length) {
      scrollToFirstInvalid(missing as string[]);
      toast("Veuillez compléter les champs en rouge", "warning");
      return;
    }
    if (data.password.length < 8) {
      scrollToFirstInvalid(["password"]);
      toast("Le mot de passe doit comporter au moins 8 caractères", "warning");
      return;
    }
    if (!agreed) {
      scrollToFirstInvalid(["agreed"]);
      toast("Vous devez accepter les conditions", "warning");
      return;
    }
    setLoading(true);
    const phone = data.phone.startsWith("+") ? data.phone : "+216" + data.phone;
    const { error } = await signUp({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      phone,
      role,
    });
    if (error) {
      setLoading(false);
      const msg = error.message.includes("already")
        ? "Cet e-mail est déjà utilisé"
        : error.message;
      toast(msg, "error");
      return;
    }
    // Hard nav so the new auth cookie is on the next request, avoiding the
    // unauthed flash that router.push used to trigger on the verify-email
    // page (which itself reads user state from the server).
    const locale = routeParams?.locale ?? "fr";
    window.location.assign(`/${locale}/verify-email`);
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
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5" data-field="firstName">
          <label className="text-xs font-semibold text-[var(--foreground-muted)]">
            Prénom
          </label>
          <Input
            placeholder="Mohamed"
            value={data.firstName}
            onChange={(e) => setData({ ...data, firstName: e.target.value })}
            iconLeft={<User className="h-4 w-4" />}
          />
        </div>
        <div className="space-y-1.5" data-field="lastName">
          <label className="text-xs font-semibold text-[var(--foreground-muted)]">
            Nom
          </label>
          <Input
            placeholder="Ben Ali"
            value={data.lastName}
            onChange={(e) => setData({ ...data, lastName: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5" data-field="email">
        <label className="text-xs font-semibold text-[var(--foreground-muted)]">
          E-mail
        </label>
        <Input
          type="email"
          placeholder="you@example.com"
          value={data.email}
          onChange={(e) => setData({ ...data, email: e.target.value })}
          iconLeft={<Mail className="h-4 w-4" />}
        />
      </div>

      <div className="space-y-1.5" data-field="phone">
        <label className="text-xs font-semibold text-[var(--foreground-muted)]">
Numéro de téléphone
        </label>
        <div className="flex gap-2">
          <div className="h-11 px-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] flex items-center text-sm font-semibold tabular-nums">
            +216
          </div>
          <Input
            type="tel"
            placeholder="20 123 456"
            value={data.phone}
            onChange={(e) => setData({ ...data, phone: e.target.value })}
            iconLeft={<Phone className="h-4 w-4" />}
          />
        </div>
      </div>

      <div className="space-y-1.5" data-field="password">
        <label className="text-xs font-semibold text-[var(--foreground-muted)]">
          Mot de passe
        </label>
        <Input
          type="password"
          placeholder="8 caractères minimum"
          value={data.password}
          onChange={(e) => setData({ ...data, password: e.target.value })}
          iconLeft={<Lock className="h-4 w-4" />}
        />
      </div>

      <label
        className="flex items-start gap-2.5 cursor-pointer"
        data-field="agreed"
      >
        <Checkbox
          className="mt-0.5"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          J&apos;accepte les{" "}
          <LegalLink kind="terms">Conditions d&apos;utilisation</LegalLink>{" "}
          et la{" "}
          <LegalLink kind="privacy">Politique de confidentialité</LegalLink>
        </span>
      </label>

      <Button type="submit" size="lg" fullWidth disabled={loading}>
        {loading ? "Création en cours..." : "Créer le compte"}
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

export default function RegisterPage() {
  return (
    <AuthShell
      title="Rejoignez Mazed Auto"
      subtitle="Commencez votre parcours dans l'univers des enchères intelligentes"
      footer={
        <>
          Vous avez déjà un compte ?{" "}
          <Link
            href="/login"
            className="text-[var(--gold)] font-semibold hover:underline"
          >
Se connecter
          </Link>
        </>
      }
    >
      <Suspense fallback={<div className="text-center py-8">Chargement...</div>}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}

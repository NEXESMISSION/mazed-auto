"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

const MIN_LENGTH = 8;

/**
 * Password change form (client island inside the settings page's
 * "Mot de passe" section card).
 *
 * Real re-authentication: when we know the account's e-mail we verify
 * the *current* password via signInWithPassword before calling
 * auth.updateUser — so a stolen open session can't silently rotate the
 * password. Accounts without an e-mail (edge case) skip that step but
 * still require a live session.
 */
export function PasswordSection({ email }: { email: string | null }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();

  const ready =
    next.length >= MIN_LENGTH &&
    confirm.length >= MIN_LENGTH &&
    (!email || current.length > 0);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < MIN_LENGTH) {
      toast(`Le nouveau mot de passe doit contenir au moins ${MIN_LENGTH} caractères.`, "warning");
      return;
    }
    if (next !== confirm) {
      toast("Les deux mots de passe ne correspondent pas.", "warning");
      return;
    }
    if (email && current === next) {
      toast("Le nouveau mot de passe doit être différent de l'actuel.", "warning");
      return;
    }
    startTransition(async () => {
      const supabase = getBrowserSupabase();

      // Current-session check — updateUser silently fails without one.
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        toast("Session expirée. Reconnectez-vous puis réessayez.", "error");
        return;
      }

      // Re-authenticate with the current password before rotating it.
      if (email) {
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email,
          password: current,
        });
        if (authErr) {
          toast("Mot de passe actuel incorrect.", "error");
          return;
        }
      }

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) {
        toast(frenchAuthError(error.message), "error");
        return;
      }
      toast("Mot de passe mis à jour.", "success");
      setCurrent("");
      setNext("");
      setConfirm("");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3.5 p-4 lg:p-5">
      {email && (
        <Field
          label="Mot de passe actuel"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
          show={show}
        />
      )}

      <Field
        label="Nouveau mot de passe"
        autoComplete="new-password"
        value={next}
        onChange={setNext}
        show={show}
        trailing={
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Masquer les mots de passe" : "Afficher les mots de passe"}
            className="tap-target absolute inset-y-0 end-3 my-auto flex items-center text-subtle transition hover:text-gold"
          >
            {show ? (
              <EyeOff className="size-4" strokeWidth={2} />
            ) : (
              <Eye className="size-4" strokeWidth={2} />
            )}
          </button>
        }
      />

      <Field
        label="Confirmer le nouveau mot de passe"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
        show={show}
      />

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[11px] text-subtle">Au moins {MIN_LENGTH} caractères.</p>
        <button
          type="submit"
          disabled={pending || !ready}
          className="batta-btn-luxe tap-target shrink-0 px-5 py-2.5 text-[13px] disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="inline size-4 animate-spin" /> Mise à jour…
            </>
          ) : (
            "Mettre à jour"
          )}
        </button>
      </div>
    </form>
  );
}

/** Translate the common Supabase auth error messages; generic FR fallback. */
function frenchAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("different from the old")) {
    return "Le nouveau mot de passe doit être différent de l'actuel.";
  }
  if (m.includes("at least")) {
    return "Le mot de passe choisi est trop court.";
  }
  if (m.includes("weak") || m.includes("easy to guess")) {
    return "Mot de passe trop faible. Choisissez-en un plus complexe.";
  }
  return "La mise à jour a échoué. Réessayez dans un instant.";
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
  show,
  trailing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  /** Shared visibility toggle — flips every field at once. */
  show: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="batta-eyebrow text-[10px]">{label}</span>
      <div className="relative mt-1.5">
        <input
          type={show ? "text" : "password"}
          value={value}
          required
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className={`w-full rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground placeholder:text-subtle focus:border-[var(--gold)] focus:outline-none focus:ring-1 focus:ring-gold/40 ${
            trailing ? "pe-11" : ""
          }`}
        />
        {trailing}
      </div>
    </label>
  );
}

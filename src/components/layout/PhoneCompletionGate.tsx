"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Phone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

/**
 * Mandatory phone-completion modal. Shown to any signed-in user whose
 * profile is missing a phone number — typically the case immediately
 * after Google OAuth signup, since Google doesn't provide a phone. The
 * gate is non-dismissible: no backdrop close, no escape, no X. It stays
 * up until the user submits a valid Tunisian number.
 *
 * Mounted globally inside AppShell so it surfaces on every authenticated
 * page. Existing users with a phone never see it.
 */
export function PhoneCompletionGate() {
  const { user, loaded } = useAuth();
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auth resolved + signed in + no phone in user_metadata. Reading
  // u.phone (top-level) covers SMS-OTP signups; falling back to
  // user_metadata.phone covers our own form-based signup. If both are
  // empty, the gate kicks in.
  const needsPhone = loaded && Boolean(user) && !user!.phone.trim();

  // Lock background scroll while the gate is up.
  useEffect(() => {
    if (!needsPhone) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [needsPhone]);

  if (!mounted || !needsPhone) return null;

  async function submit() {
    setError(null);
    const cleaned = phone.replace(/[\s\-().]/g, "");
    if (!cleaned) {
      setError("Le numéro de téléphone est requis");
      return;
    }
    // Tunisian numbers — 8 digits, optionally with +216 / 216 prefix.
    if (!/^(\+?216)?[0-9]{8}$/.test(cleaned)) {
      setError("Format invalide — entrez 8 chiffres (numéro tunisien)");
      return;
    }
    // Normalise to a +216-prefixed string before storing.
    const normalised = cleaned.startsWith("+216")
      ? cleaned
      : cleaned.startsWith("216")
        ? "+" + cleaned
        : "+216" + cleaned;
    setSubmitting(true);
    const supabase = createClient();
    const { error: e } = await supabase.auth.updateUser({
      data: { phone: normalised },
    });
    setSubmitting(false);
    if (e) {
      setError("Échec de l'enregistrement : " + e.message);
      return;
    }
    // Reload so server pages re-fetch the user (and the gate disappears).
    window.location.reload();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-gate-title"
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
    >
      {/* Solid backdrop — no onClick handler, so taps don't dismiss. */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      <div className="relative w-full max-w-md mx-0 md:mx-4 bg-[var(--surface)] border border-[var(--gold-soft)]/40 rounded-t-[var(--radius-xl)] md:rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] overflow-hidden">
        <div className="p-6 space-y-5">
          <div className="text-center space-y-3">
            <div className="mx-auto h-14 w-14 rounded-full bg-[var(--gold-faint)] border border-[var(--gold)]/40 flex items-center justify-center shadow-[var(--shadow-gold)]">
              <Phone className="h-7 w-7 text-[var(--gold)]" />
            </div>
            <h2
              id="phone-gate-title"
              className="text-xl font-extrabold tracking-tight"
            >
              Ajoutez votre numéro de téléphone
            </h2>
            <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
              Une dernière étape pour finaliser votre compte. Le numéro
              protège vos enchères et nous permet de vous contacter en cas
              de besoin.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!submitting) submit();
            }}
            className="space-y-3"
          >
            <div>
              <label
                htmlFor="phone-gate-input"
                className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]"
              >
                Numéro de téléphone
              </label>
              <Input
                id="phone-gate-input"
                type="tel"
                inputMode="tel"
                autoFocus
                placeholder="+216 12 345 678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1.5"
              />
              {error && (
                <div className="mt-2 text-[12px] text-[var(--danger)] font-semibold">
                  {error}
                </div>
              )}
            </div>

            <Button type="submit" size="md" fullWidth disabled={submitting}>
              <ShieldCheck className="h-4 w-4" />
              {submitting ? "Enregistrement..." : "Enregistrer et continuer"}
            </Button>
          </form>

          <p className="text-[11px] text-center text-[var(--foreground-subtle)] leading-relaxed">
            Cette information reste confidentielle. Nous ne la partagerons
            jamais avec d'autres utilisateurs.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

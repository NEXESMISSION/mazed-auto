"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Zap } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";

const IS_DEV = process.env.NODE_ENV !== "production";
const DEV_CODE = "000000";

export default function VerifyPhonePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    if (!sentOnce && user) {
      send();
      setSentOnce(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function handleChange(i: number, v: string) {
    const digit = v.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    if (digit && i < 5) inputs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    const next = [...code];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCode(next);
    inputs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function send() {
    setBusy(true);
    if (IS_DEV) {
      // Simulated SMS — no real provider. The "code" is always DEV_CODE.
      await new Promise((r) => setTimeout(r, 350));
      setBusy(false);
      setCooldown(60);
      toast(`SMS de test : utilisez le code ${DEV_CODE}`, "info");
      return;
    }
    if (!user?.phone) {
      setBusy(false);
      toast("Nous n'avons pas trouvé votre numéro de téléphone", "error");
      return;
    }
    const { error } = await sendPhoneOtp(user.phone);
    setBusy(false);
    if (error) {
      toast("Échec d'envoi du code SMS — vérifiez l'activation des SMS dans Supabase", "error");
      return;
    }
    setCooldown(60);
    toast(`Code envoyé au ${user.phone}`, "info");
  }

  async function fakeVerify() {
    // Dev path — accept the dev code and call the server route that uses
    // service-role to mark phone_confirmed_at on auth.users.
    setBusy(true);
    const res = await fetch("/api/dev/verify-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: user?.phone }),
    });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast("Échec de la vérification : " + (err?.error || "Erreur inconnue"), "error");
      return;
    }
    toast("Numéro vérifié", "success");
    router.push("/kyc/start");
    router.refresh();
  }

  async function verify() {
    if (code.some((c) => !c)) {
      toast("Saisissez le code complet", "warning");
      return;
    }

    if (IS_DEV) {
      // Accept any 6-digit code in dev so the tester doesn't have to type
      // the magic one — the whole flow is fake anyway.
      await fakeVerify();
      return;
    }

    if (!user?.phone) {
      toast("Nous n'avons pas trouvé votre numéro de téléphone", "error");
      return;
    }
    setBusy(true);
    const { error } = await verifyPhoneOtp(user.phone, code.join(""));
    setBusy(false);
    if (error) {
      toast("Code incorrect", "error");
      return;
    }
    toast("Numéro vérifié", "success");
    router.push("/kyc/start");
    router.refresh();
  }

  const phone =
    user?.phone || (IS_DEV ? "Simulation (numéro réel inutile)" : "+216 XX XXX XXX");

  return (
    <AuthShell
      title="Vérification du numéro de téléphone"
      subtitle={
        IS_DEV
          ? "Mode test : nous avons envoyé un code factice, utilisez 000000 ou n'importe quels 6 chiffres"
          : `Nous avons envoyé un code à 6 chiffres au ${phone}`
      }
    >
      <div className="space-y-6">
        {IS_DEV && (
          <div className="rounded-[var(--radius)] border border-dashed border-amber-500/40 bg-amber-500/5 p-3 flex items-center gap-2 text-xs text-amber-300">
            <Zap className="h-3.5 w-3.5 shrink-0" />
            <div className="leading-relaxed">
              <span className="font-bold">Mode test :</span> tout code à 6 chiffres est accepté et le
              numéro de téléphone est confirmé immédiatement. Cliquez sur
              {" "}
              <button
                type="button"
                onClick={() => setCode([..."000000"])}
                className="underline font-bold"
              >
                Remplir {DEV_CODE} automatiquement
              </button>
              .
            </div>
          </div>
        )}

        <div
          className="flex justify-center gap-2 dir-ltr"
          style={{ direction: "ltr" }}
          onPaste={handlePaste}
        >
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="h-12 w-11 md:h-14 md:w-12 text-center text-xl font-bold rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] focus:border-[var(--gold)] focus:outline-none focus:ring-1 focus:ring-[var(--gold)]/30 tabular-nums"
              maxLength={1}
            />
          ))}
        </div>

        <Button size="lg" fullWidth onClick={verify} disabled={busy}>
          {busy ? "Vérification en cours..." : "Vérifier"}
          {!busy && <ArrowRight className="h-5 w-5" />}
        </Button>

        <div className="text-center text-sm text-[var(--foreground-muted)]">
          Code non reçu ?{" "}
          {cooldown > 0 ? (
            <span className="text-[var(--foreground-subtle)]">
              Renvoyer dans {cooldown}s
            </span>
          ) : (
            <button
              onClick={send}
              disabled={busy}
              className="text-[var(--gold)] font-semibold hover:underline disabled:opacity-50"
            >
              Renvoyer
            </button>
          )}
        </div>
      </div>
    </AuthShell>
  );
}

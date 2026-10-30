"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, CheckCircle2 } from "lucide-react";
import { PhoneInput } from "./PhoneInput";
import { PasswordInput } from "./PasswordInput";
import { OtpStep, otpErrorKey } from "./OtpStep";
import { usePhoneProblem } from "./usePhoneProblem";
import { normalizeE164, validatePhone } from "@/lib/tunisia";

/**
 * Phone-OTP password recovery (phone-only app — there is no email inbox).
 *
 * Three self-contained steps on /forgot-password:
 *   1. phone     → POST /api/auth/phone/send   (SMS code)
 *   2. otp       → POST /api/auth/phone/verify (stamps a short-lived verified_at proof)
 *   3. password  → POST /api/auth/reset-password (server checks the proof, then
 *                  admin-updates the password) → auto sign-in with the fresh
 *                  credentials (falls back to /login if that fails).
 *
 * The OTP proof is server-side (phone_otps.verified_at keyed by phone) so the
 * client never holds a recovery token. Reuses the exact send/verify routes the
 * signup flow uses.
 */
type Phase = "phone" | "otp" | "password" | "done";

export function ForgotPasswordForm() {
  const t = useTranslations();
  const tf = useTranslations("auth.forgot");
  const to = useTranslations("auth.otp");
  const phoneProblem = usePhoneProblem();
  const router = useRouter();
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>("phone");
  const [autoLoggedIn, setAutoLoggedIn] = useState(false);
  const [dialCode, setDialCode] = useState("+216");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phone, setPhone] = useState<string | null>(null); // normalized E.164
  const [otpCode, setOtpCode] = useState("");
  // The one-time proof the code earned (0199), sent with the new password.
  const [proof, setProof] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Tick the resend cooldown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Step 1 — request an SMS code for the entered number.
  function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const check = validatePhone(dialCode, phoneNumber);
    if (!check.ok) {
      setError(phoneProblem(check, dialCode));
      return;
    }
    const normalized = normalizeE164(dialCode, phoneNumber);
    if (!normalized) {
      setError(t("phone.invalid"));
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/phone/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: normalized }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          configured?: boolean;
          error?: string;
          retryAfter?: number;
        };
        // SMS off → there is no recovery channel for phone-only accounts.
        if (res.ok && j.configured === false) {
          setError(tf("smsUnavailable"));
          return;
        }
        if (res.ok && j.ok) {
          setPhone(normalized);
          setPhase("otp");
          setOtpCode("");
          setCooldown(60);
          return;
        }
        // 429 → a code is already out / hourly cap — let them enter what they have.
        if (res.status === 429) {
          setPhone(normalized);
          setPhase("otp");
          setCooldown(j.error === "cooldown" ? j.retryAfter ?? 60 : 60);
          return;
        }
        if (res.status === 400 && j.error === "invalid_phone") {
          setError(t("auth.signup.errors.invalid_phone"));
          return;
        }
        setError(to("errors.sendFailed"));
      } catch {
        setError(t("auth.errors.network"));
      }
    });
  }

  // Step 2 — verify the 6-digit code (stamps the server-side proof).
  function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = otpCode.replace(/\D/g, "");
    if (clean.length !== 6) {
      setError(to("enterCode"));
      return;
    }
    if (!phone) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/phone/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, code: clean }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; proof?: string };
        if (res.ok && j.ok) {
          // The server asks for this proof with the new password (0199).
          setProof(j.proof ?? "");
          setPhase("password");
          return;
        }
        setError(to(otpErrorKey(j.error)));
      } catch {
        setError(to("errors.network"));
      }
    });
  }

  function resend() {
    if (cooldown > 0 || !phone) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/phone/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; retryAfter?: number; error?: string };
        if (res.ok && j.ok) setCooldown(60);
        else if (res.status === 429 && j.error === "cooldown") setCooldown(j.retryAfter ?? 60);
        else setError(to("errors.resendFailed"));
      } catch {
        setError(to("errors.network"));
      }
    });
  }

  // Step 3 — set the new password (server re-checks the OTP proof).
  function onSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("auth.password.tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.password.mismatch"));
      return;
    }
    if (!phone) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password, proof }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && j.ok) {
          // Auto sign-in with the fresh credentials so the user lands home
          // already authenticated. Best-effort: any failure falls back to the
          // old redirect-to-/login behaviour (the reset itself succeeded).
          let signedIn = false;
          try {
            const login = await fetch("/api/auth/login-by-phone", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phone, password }),
            });
            const lj = (await login.json().catch(() => ({}))) as { ok?: boolean };
            signedIn = !!lj.ok;
          } catch {
            // network hiccup — the fallback below still gets them to /login
          }
          setAutoLoggedIn(signedIn);
          setPhase("done");
          setTimeout(() => {
            // Hard navigation when signed in: the auth cookie was written by
            // the login response; a soft navigation can render anonymous.
            if (signedIn) window.location.assign(`/${locale}`);
            else router.replace("/login");
          }, 1200);
          return;
        }
        if (j.error === "phone_not_verified") {
          // Proof expired between verify and submit — restart from the top.
          setError(tf("errors.expired"));
          setPhase("phone");
          setOtpCode("");
          return;
        }
        const known = ["weak_password", "no_account", "rate_limited"];
        setError(tf(`errors.${known.includes(j.error ?? "") ? j.error : "generic"}`));
      } catch {
        setError(t("auth.errors.network"));
      }
    });
  }

  if (phase === "done") {
    return (
      <div className="batta-frame-gold p-6 text-center">
        <span className="batta-monogram batta-monogram-filled mx-auto mb-3 size-12 text-[18px]">
          <CheckCircle2 className="size-5" strokeWidth={1.75} />
        </span>
        <h2 className="batta-serif text-[16px] font-semibold text-batta-cream">
          {tf("updated")}
        </h2>
        <p className="mt-2 text-[12.5px] text-batta-cream/75">
          {autoLoggedIn ? tf("signingIn") : tf("toLogin")}
        </p>
      </div>
    );
  }

  if (phase === "otp") {
    return (
      <OtpStep
        phone={phone ?? ""}
        code={otpCode}
        onCodeChange={setOtpCode}
        onVerify={onVerify}
        onResend={resend}
        onBack={() => { setPhase("phone"); setError(null); setOtpCode(""); }}
        cooldown={cooldown}
        error={error}
        pending={isPending}
        submitLabel={to("verify")}
        backLabel={to("changeNumber")}
      />
    );
  }

  if (phase === "password") {
    return (
      <form onSubmit={onSetPassword} className="space-y-4">
        <PasswordInput
          label={t("auth.password.new")}
          value={password}
          onChange={setPassword}
          required
          minLength={8}
          autoFocus
          autoComplete="new-password"
        />
        <PasswordInput
          label={t("auth.password.confirm")}
          value={confirm}
          onChange={setConfirm}
          required
          minLength={8}
          autoComplete="new-password"
        />
        {error && (
          <p role="alert" aria-live="assertive" className="batta-tone-bad rounded-lg px-3 py-2 text-xs">{error}</p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="batta-btn-luxe tap-target w-full px-5 py-3 text-[13.5px] disabled:opacity-50"
        >
          {isPending ? (
            <><Loader2 className="inline size-4 animate-spin" /> {t("auth.password.updating")}</>
          ) : (
            t("auth.password.update")
          )}
        </button>
      </form>
    );
  }

  // phase === "phone"
  return (
    <form onSubmit={onSendCode} className="space-y-4">
      <label className="block">
        <span className="batta-eyebrow text-[10px]">{t("phone.label")}</span>
        <PhoneInput
          dialCode={dialCode}
          onDialCodeChange={setDialCode}
          number={phoneNumber}
          onNumberChange={setPhoneNumber}
          required
        />
      </label>
      {error && (
        <p role="alert" aria-live="assertive" className="batta-tone-bad rounded-lg px-3 py-2 text-xs">{error}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="batta-btn-luxe tap-target w-full px-5 py-3 text-[13.5px] disabled:opacity-50"
      >
        {isPending ? (
          <><Loader2 className="inline size-4 animate-spin" /> {tf("sending")}</>
        ) : (
          tf("sendCode")
        )}
      </button>
    </form>
  );
}

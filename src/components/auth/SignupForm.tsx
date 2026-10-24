"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { PhoneInput } from "./PhoneInput";
import { PasswordInput } from "./PasswordInput";
import { Loader2 } from "lucide-react";
import { normalizeE164, validatePhone } from "@/lib/tunisia";
import { usePhoneProblem } from "./usePhoneProblem";
import { OtpStep, otpErrorKey } from "./OtpStep";
import { Modal } from "@/components/ui/Modal";
import { TermsContent, PrivacyContent } from "@/components/legal/LegalContent";

// Signup is intentionally identity-only. Role elevation (agency, bank,
// bailiff, inspector, admin) happens via dedicated admin-reviewed flows
// after signup — never client-supplied. The DB's _on_auth_user_created
// trigger ignores any client-set role and pins new profiles to
// 'individual' regardless.
//
// PHONE-ONLY: there is no email field. Account creation runs server-side
// (/api/auth/signup) which mints a synthetic, pre-confirmed email from the
// phone so Supabase still has an identifier — the user never sees or needs an
// email. Required fields:
//   - full name
//   - dial code + phone (split fields → composed to E.164 on submit)
//   - ville / gouvernorat (24-item native select)
//   - password (min 8)
//
// The metadata keys (full_name, phone, language) are passed to
// admin.createUser and picked up by `_on_auth_user_created` (migration 0045)
// when the auth.users row is inserted.
export function SignupForm() {
  const t = useTranslations();
  const ts = useTranslations("auth.signup");
  const to = useTranslations("auth.otp");
  const phoneProblem = usePhoneProblem();
  const locale = useLocale();
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [dialCode, setDialCode] = useState("+216");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [legalModal, setLegalModal] = useState<null | "terms" | "privacy">(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Phone-OTP gate (active only when WinSMS is configured server-side).
  const [otpPhase, setOtpPhase] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);

  // Tick the resend cooldown.
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setInterval(() => setOtpCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [otpCooldown]);

  // The real account creation — runs after phone verification (or directly
  // when SMS isn't configured). Server-side: /api/auth/signup creates the
  // account with a synthetic pre-confirmed email AND signs the user in (sets
  // the auth cookie on its response), so on success we just hard-navigate.
  async function performSignup(normalizedPhone: string) {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: normalizedPhone,
          password,
          full_name: fullName,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        const known = ["phone_taken", "weak_password", "invalid_phone", "rate_limited", "phone_not_verified"];
        setError(ts(`errors.${known.includes(j.error ?? "") ? j.error : "generic"}`));
        setOtpPhase(false);
        return;
      }
    } catch {
      setError(t("auth.errors.network"));
      setOtpPhase(false);
      return;
    }
    // Hard navigation (not router.replace+refresh): the auth cookie was just
    // written by the signup response; a soft refresh can prefetch the
    // destination before the cookie propagates, leaving the render anonymous.
    // Home, not /kyc. KYC was deleted in the pivot; that path only still
    // resolves because the middleware rewrites it to /account, so every new
    // account was taking a redirect hop to a page it had no reason to open.
    window.location.assign(`/${locale}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const check = validatePhone(dialCode, phoneNumber);
    if (!check.ok) {
      setError(phoneProblem(check, dialCode));
      return;
    }
    const normalizedPhone = normalizeE164(dialCode, phoneNumber);
    if (!normalizedPhone) {
      // normalizeE164 only returns null on degenerate input that
      // validatePhone already caught. Defensive fallback so a future
      // schema change in one helper can't ship a confusing form error.
      setError(t("phone.invalid"));
      return;
    }
    if (!accepted) {
      setError(ts("mustAccept"));
      return;
    }
    startTransition(async () => {
      // Step 1: request an SMS code. The phone-OTP gate must NEVER block
      // account creation through a fault on our side — so anything that isn't
      // a clean "code sent" or a user-fixable bad number falls through to
      // creating the account directly. Availability of signup > the optional
      // SMS gate; an unverified phone is acceptable, a dead signup funnel isn't.
      const goToOtp = (cooldown: number) => {
        setVerifiedPhone(normalizedPhone);
        setOtpPhase(true);
        setOtpCode("");
        setOtpError(null);
        setOtpCooldown(cooldown);
      };
      try {
        const res = await fetch("/api/auth/phone/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: normalizedPhone }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          configured?: boolean;
          error?: string;
          retryAfter?: number;
        };
        // SMS disabled server-side → create the account directly (old flow).
        if (res.ok && j.configured === false) {
          await performSignup(normalizedPhone);
          return;
        }
        // Code sent → go to the verification step.
        if (res.ok && j.ok) {
          goToOtp(60);
          return;
        }
        // 429: a valid code is already out (recent send) or the hourly cap was
        // hit — either way let the user enter the code they have.
        if (res.status === 429) {
          goToOtp(j.error === "cooldown" ? j.retryAfter ?? 60 : 60);
          return;
        }
        // Bad phone number → the only case the user must fix before continuing.
        if (res.status === 400 && j.error === "invalid_phone") {
          setError(ts("errors.invalid_phone"));
          return;
        }
        // SMS IS configured (we didn't get configured:false) but the send
        // failed (provider/DB hiccup, no credit, cold start). Do NOT fall
        // through to performSignup: with SMS on, /api/auth/signup fails CLOSED
        // (phone_not_verified) so the account can't be created without a code,
        // and the user would just see the confusing generic error. Surface the
        // real problem and let them retry.
        setError(to("errors.sendFailed"));
      } catch {
        // Couldn't even reach our API — surface it. performSignup would also
        // fail to reach it, and with SMS on it couldn't create the account.
        setError(t("auth.errors.network"));
      }
    });
  }

  function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setOtpError(null);
    const clean = otpCode.replace(/\D/g, "");
    if (clean.length !== 6) {
      setOtpError(to("enterCode"));
      return;
    }
    if (!verifiedPhone) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/phone/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: verifiedPhone, code: clean }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && j.ok) {
          await performSignup(verifiedPhone);
          return;
        }
        setOtpError(to(otpErrorKey(j.error)));
      } catch {
        setOtpError(to("errors.network"));
      }
    });
  }

  function resendOtp() {
    if (otpCooldown > 0 || !verifiedPhone) return;
    setOtpError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/phone/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: verifiedPhone }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; retryAfter?: number; error?: string };
        if (res.ok && j.ok) {
          setOtpCooldown(60);
        } else if (res.status === 429 && j.error === "cooldown") {
          setOtpCooldown(j.retryAfter ?? 60);
        } else {
          setOtpError(to("errors.resendFailed"));
        }
      } catch {
        setOtpError(to("errors.network"));
      }
    });
  }

  if (otpPhase) {
    return (
      <OtpStep
        phone={verifiedPhone ?? ""}
        code={otpCode}
        onCodeChange={setOtpCode}
        onVerify={onVerify}
        onResend={resendOtp}
        onBack={() => {
          setOtpPhase(false);
          setOtpError(null);
          setOtpCode("");
        }}
        cooldown={otpCooldown}
        error={otpError}
        pending={isPending}
        submitLabel={to("verifyAndCreate")}
        backLabel={to("editInfo")}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label={ts("fullName")} value={fullName} onChange={setFullName} required autoComplete="name" />

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

      <PasswordInput
        label={ts("password")}
        value={password}
        onChange={setPassword}
        required
        minLength={8}
        autoComplete="new-password"
      />
      {/* Terms + privacy consent — required. The documents open in a modal
          so the user can read them without leaving signup. The legal links
          are NOT wrapped in the <label> (a label would steal their clicks and
          toggle the checkbox instead of opening the modal). */}
      <div className="flex items-start gap-2.5 text-[12px] leading-relaxed text-batta-cream/80">
        <input
          id="signup-accept"
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--gold)]"
        />
        <span>
          {ts.rich("accept", {
            l: (chunks) => <label htmlFor="signup-accept" className="cursor-pointer">{chunks}</label>,
            terms: (chunks) => (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setLegalModal("terms"); }}
                className="font-bold text-batta-cream underline transition hover:text-gold-bright"
              >
                {chunks}
              </button>
            ),
            privacy: (chunks) => (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setLegalModal("privacy"); }}
                className="font-bold text-batta-cream underline transition hover:text-gold-bright"
              >
                {chunks}
              </button>
            ),
          })}
        </span>
      </div>

      {error && (
        <p role="alert" aria-live="assertive" className="batta-tone-bad rounded-lg px-3 py-2 text-xs">{error}</p>
      )}
      <button
        type="submit"
        disabled={isPending || !accepted}
        title={!accepted && !isPending ? ts("acceptFirst") : undefined}
        className="batta-btn-luxe tap-target w-full px-5 py-3 text-[13.5px] disabled:opacity-50"
      >
        {isPending ? (
          <><Loader2 className="inline size-4 animate-spin" /> {ts("submitting")}</>
        ) : (
          t("nav.signup")
        )}
      </button>

      <Modal
        open={legalModal !== null}
        onClose={() => setLegalModal(null)}
        size="lg"
        title={legalModal === "privacy" ? ts("privacy") : ts("terms")}
      >
        {legalModal === "privacy" ? <PrivacyContent /> : <TermsContent />}
      </Modal>
      <p className="text-center text-[11px] text-batta-muted">
        {ts.rich("partnerNote", { b: (chunks) => <span className="text-batta-cream">{chunks}</span> })}
      </p>
    </form>
  );
}

function Field({
  label, type = "text", value, onChange, required, minLength, placeholder, autoComplete,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="batta-eyebrow text-[10px]">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-batta-gold/25 bg-batta-surface-2 px-4 py-2.5 text-sm text-batta-cream placeholder:text-batta-muted focus:border-batta-gold focus:outline-none focus:ring-1 focus:ring-batta-gold/40"
      />
    </label>
  );
}

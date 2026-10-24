"use client";

import { useTranslations } from "next-intl";
import { Loader2, Smartphone } from "lucide-react";

const OTP_ERRORS = ["wrong_code", "expired", "no_code", "too_many_attempts"];

/** The message key, under `auth.otp`, for an error from /api/auth/phone/verify. */
export function otpErrorKey(error: string | undefined): string {
  return `errors.${error && OTP_ERRORS.includes(error) ? error : "failed"}`;
}

/**
 * The SMS code step — between the signup form and the account's creation
 * (only when WinSMS is configured server-side), and in the middle of the
 * password recovery. Mirrors the "check your email" card's visual language.
 */
export function OtpStep({
  phone, code, onCodeChange, onVerify, onResend, onBack, cooldown, error, pending, submitLabel, backLabel,
}: {
  phone: string;
  code: string;
  onCodeChange: (v: string) => void;
  onVerify: (e: React.FormEvent) => void;
  onResend: () => void;
  onBack: () => void;
  cooldown: number;
  error: string | null;
  pending: boolean;
  submitLabel: string;
  backLabel: string;
}) {
  const t = useTranslations("auth.otp");
  return (
    <form onSubmit={onVerify} className="batta-frame-gold relative p-6 text-center">
      <span className="batta-monogram batta-monogram-filled mx-auto mb-3 size-12 text-[18px]">
        <Smartphone className="size-5" strokeWidth={1.75} />
      </span>
      <h2 className="batta-serif text-[18px] font-semibold text-batta-cream">
        {t("title")}
      </h2>
      <p className="mt-2 text-sm text-batta-cream/75">
        {t.rich("sentTo", {
          number: phone,
          phone: (chunks) => <span className="ltr-island font-bold text-batta-cream">{chunks}</span>,
        })}
      </p>

      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        dir="ltr"
        maxLength={6}
        value={code}
        onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ""))}
        placeholder="••••••"
        aria-label={t("codeLabel")}
        className="mt-5 w-full rounded-xl border border-batta-gold/25 bg-batta-surface-2 px-4 py-3 text-center text-[22px] font-bold tracking-[0.4em] text-batta-cream placeholder:text-batta-muted focus:border-batta-gold focus:outline-none focus:ring-1 focus:ring-batta-gold/40"
      />

      {error && (
        <p role="alert" aria-live="assertive" className="batta-tone-bad mt-3 rounded-lg px-3 py-2 text-xs">{error}</p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="submit"
          disabled={pending || code.replace(/\D/g, "").length !== 6}
          className="batta-btn-luxe tap-target w-full px-5 py-3 text-[13px] disabled:opacity-50"
        >
          {pending ? (
            <><Loader2 className="inline size-4 animate-spin" /> {t("verifying")}</>
          ) : (
            submitLabel
          )}
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={cooldown > 0 || pending}
          className="batta-btn-ghost-gold tap-target w-full px-5 py-3 text-[13px] disabled:opacity-50"
        >
          {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-[12px] text-batta-cream/70 hover:text-gold-bright"
        >
          {backLabel}
        </button>
      </div>
    </form>
  );
}

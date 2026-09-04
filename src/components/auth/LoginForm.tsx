"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { stripLocalePrefix } from "@/i18n/routing";
import { PhoneInput } from "./PhoneInput";
import { PasswordInput } from "./PasswordInput";
import { normalizeE164, validatePhone } from "@/lib/tunisia";

/**
 * Reject anything that, despite starting with "/", could be parsed by
 * the browser as a foreign origin:
 *   - `//evil.com` and `/\evil.com` are protocol-relative (browser
 *     treats them as host).
 *   - URLs with embedded `:` (scheme), or already-absolute URLs.
 *   - `\` in any position (Windows-style separator confuses some
 *     normalizers).
 * The current code prepends `/${locale}` which neutralizes the obvious
 * cases, but we still defence-in-depth here so a future refactor doesn't
 * accidentally make this an open redirect.
 */
function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.includes("\\")) return "/";
  // Bare scheme-relative or absolute URL via a creative encoding
  // (very rare, but cheap to block).
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(raw)) return "/";
  return raw;
}

/**
 * Phone-only sign-in. Email auth was removed — the only identity is the phone
 * number (country-code chip + local digits). The sign-in itself is fully
 * server-side (/api/auth/login-by-phone): the phone→email resolution AND the
 * sign-in happen on the server so the account's synthetic email never reaches
 * the client. The route writes the auth cookie onto its response; we just reload.
 *
 * Honors `?next=/some/path` so users coming from a "Sign in to bid" link land
 * back where they were. The next-intl router prepends the active locale itself,
 * so we strip the redundant prefix from `next` to avoid `/ar/ar/...`.
 */
export function LoginForm() {
  const t = useTranslations();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next");
  const safeNext = safeNextPath(rawNext);
  const next = safeNext === "/" ? "/" : stripLocalePrefix(safeNext);

  const [dialCode, setDialCode] = useState("+216");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Validate BEFORE the transition so plainly-invalid input doesn't flash the
    // pending spinner (audit #26).
    const check = validatePhone(dialCode, phoneNumber);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    const phone = normalizeE164(dialCode, phoneNumber);
    if (!phone) {
      setError("Numéro invalide.");
      return;
    }
    startTransition(async () => {
      // Hard navigation (not router.replace+refresh): the @supabase/ssr auth
      // cookie is written synchronously, but a soft refresh can prefetch the
      // destination before the cookie propagates, leaving the render anonymous.
      const destination = next === "/" ? `/${locale}` : `/${locale}${next}`;
      try {
        const res = await fetch("/api/auth/login-by-phone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!data.ok) {
          // A wrong number and a wrong password stay indistinguishable — that
          // is deliberate, it is what stops the form being an account oracle.
          //
          // But everything ELSE was being reported as bad credentials too, and
          // that is not caution, it is a lie: someone who trips the rate limit
          // after five quick tries is told their password is wrong, so they
          // retry, stay locked out, and reset a password that was correct all
          // along. Name the failures that are not about the credentials.
          setError(
            data.error === "rate_limited"
              ? "Trop de tentatives. Patientez quelques minutes avant de réessayer — vos identifiants ne sont peut-être pas en cause."
              : res.status >= 500
                ? "Service indisponible pour le moment. Réessayez dans un instant."
                : "Identifiants invalides. Vérifiez le numéro et le mot de passe.",
          );
          return;
        }
      } catch {
        setError(
          "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.",
        );
        return;
      }
      window.location.assign(destination);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="batta-eyebrow text-[10px]">Téléphone</span>
        <PhoneInput
          dialCode={dialCode}
          onDialCodeChange={setDialCode}
          number={phoneNumber}
          onNumberChange={setPhoneNumber}
          required
        />
      </label>

      <PasswordInput
        label="Mot de passe"
        value={password}
        onChange={setPassword}
        required
        invalid={!!error}
        describedBy="login-error"
        autoComplete="current-password"
      />
      {error && <p id="login-error" role="alert" aria-live="assertive" className="batta-tone-bad rounded-lg px-3 py-2 text-xs">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="batta-btn-luxe tap-target w-full px-5 py-3 text-[13.5px] disabled:opacity-50"
      >
        {isPending ? (
          <><Loader2 className="inline size-4 animate-spin" /> Connexion…</>
        ) : (
          t("nav.login")
        )}
      </button>
    </form>
  );
}

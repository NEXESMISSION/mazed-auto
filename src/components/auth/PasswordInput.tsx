"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Password field with a show/hide eye toggle, shared by every auth form
 * (login, signup, forgot/reset password).
 *
 * Visibility is purely click-driven: it flips ONLY when the eye button is
 * pressed — no blur/timeout auto-hide — so the user can proofread a long
 * password without racing the UI. The button is type="button" (never submits)
 * and swallows mousedown so toggling doesn't steal focus from the input.
 */
export function PasswordInput({
  label,
  value,
  onChange,
  required,
  minLength,
  autoComplete,
  autoFocus,
  invalid,
  describedBy,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  autoFocus?: boolean;
  /** Mark the field invalid + point AT to the error message (a11y). */
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  return (
    <label className="block" htmlFor={inputId}>
      <span className="batta-eyebrow text-[10px]">{label}</span>
      <div className="relative mt-1.5">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          required={required}
          minLength={minLength}
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? describedBy : undefined}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-batta-gold/25 bg-batta-surface-2 py-2.5 pe-11 ps-4 text-sm text-batta-cream placeholder:text-batta-muted focus:border-batta-gold focus:outline-none focus:ring-1 focus:ring-batta-gold/40"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          onMouseDown={(e) => e.preventDefault()}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
          className="tap-target absolute inset-y-0 end-0 flex items-center px-3.5 text-batta-muted transition-colors hover:text-batta-cream"
        >
          {visible ? (
            <EyeOff className="size-4.5" strokeWidth={2} />
          ) : (
            <Eye className="size-4.5" strokeWidth={2} />
          )}
        </button>
      </div>
    </label>
  );
}

"use client";

import { useState } from "react";
import { usePathname } from "@/i18n/navigation";
import {
  HelpCircle,
  MessageCircle,
  Phone,
  Mail,
  X,
} from "lucide-react";

/**
 * Floating support widget. Tap the FAB → a small panel pops up with
 * three contact actions: WhatsApp, phone call, email.
 *
 * Hidden on routes where overlapping a CTA would be harmful (KYC capture,
 * payment checkout, seller wizard, register/login). The component is
 * mounted from AppShell so it appears on every public page by default;
 * admin routes use AdminShell which doesn't include it.
 *
 * Props come from server-fetched platform_settings so the admin can change
 * the displayed number from /admin/settings without redeploying.
 */
interface Props {
  phone: string;
  email: string;
}

// Paths where we suppress the FAB so it doesn't sit on top of a
// critical input (camera viewport, payment submit, etc.).
const SUPPRESS_PATHS = [
  "/kyc/",
  "/payment/",
  "/seller/new",
  "/login",
  "/register",
  "/verify-",
  "/forgot-password",
  "/reset-password",
];

function digitsOnly(s: string): string {
  return s.replace(/[^\d]/g, "");
}

export function SupportFab({ phone, email }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Hide on protected/flow pages where a floating widget gets in the way.
  if (SUPPRESS_PATHS.some((p) => pathname.startsWith(p))) return null;

  const phoneDigits = digitsOnly(phone);
  const waHref = `https://wa.me/${phoneDigits}`;
  const telHref = `tel:+${phoneDigits}`;
  const mailHref = `mailto:${email}?subject=${encodeURIComponent("Support Mazed Auto")}`;

  return (
    <>
      {/* Expanded panel — slides up above the FAB */}
      {open && (
        <>
          {/* Backdrop (mobile only — desktop is corner-anchored) */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer"
            className="md:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-150"
          />

          <div
            role="dialog"
            aria-label="Aide et contact"
            className="
              fixed z-50
              end-4 bottom-[calc(var(--bottombar-h)+env(safe-area-inset-bottom)+72px)]
              md:bottom-[88px]
              w-[260px] max-w-[calc(100vw-2rem)]
              rounded-2xl overflow-hidden
              bg-[var(--surface)] ring-1 ring-[var(--gold)]/30
              shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]
              animate-in slide-in-from-bottom-2 fade-in duration-200
            "
          >
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] font-extrabold text-[var(--gold)]">
                  Aide
                </div>
                <div className="text-sm font-bold mt-0.5">
                  Besoin d&apos;aide ?
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="h-7 w-7 rounded-full hover:bg-[var(--surface-2)] flex items-center justify-center"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-2 space-y-1">
              <ContactRow
                href={waHref}
                Icon={MessageCircle}
                label="WhatsApp"
                sub={phone}
                tone="whatsapp"
                target="_blank"
              />
              <ContactRow
                href={telHref}
                Icon={Phone}
                label="Appeler"
                sub={phone}
                tone="default"
              />
              <ContactRow
                href={mailHref}
                Icon={Mail}
                label="Email"
                sub={email}
                tone="default"
              />
            </div>

            <div className="px-4 py-3 border-t border-[var(--border)] text-[10px] text-[var(--foreground-muted)] leading-snug">
              Réponse en moins de 24 h. Pour une urgence sur un paiement,
              utilisez WhatsApp.
            </div>
          </div>
        </>
      )}

      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fermer l'aide" : "Aide et contact"}
        aria-expanded={open}
        className="
          fixed z-50
          end-4 bottom-[calc(var(--bottombar-h)+env(safe-area-inset-bottom)+12px)]
          md:bottom-6
          h-14 w-14 rounded-full
          bg-[var(--gold)] text-black
          shadow-[var(--shadow-gold)]
          flex items-center justify-center
          transition-transform active:scale-95 hover:scale-105
        "
      >
        {open ? (
          <X className="h-5 w-5" strokeWidth={2.5} />
        ) : (
          <HelpCircle className="h-6 w-6" strokeWidth={2.2} />
        )}
      </button>
    </>
  );
}

function ContactRow({
  href,
  Icon,
  label,
  sub,
  tone,
  target,
}: {
  href: string;
  Icon: typeof MessageCircle;
  label: string;
  sub: string;
  tone: "whatsapp" | "default";
  target?: "_blank";
}) {
  return (
    <a
      href={href}
      target={target}
      rel={target ? "noopener noreferrer" : undefined}
      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--surface-2)] transition-colors group"
    >
      <span
        className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
          tone === "whatsapp"
            ? "bg-[#25D366]/15 text-[#25D366] group-hover:bg-[#25D366] group-hover:text-white"
            : "bg-[var(--surface-2)] text-[var(--gold)] group-hover:bg-[var(--gold)] group-hover:text-black"
        } transition-colors`}
      >
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-bold leading-tight">{label}</div>
        <div className="text-[11px] text-[var(--foreground-muted)] truncate">
          {sub}
        </div>
      </div>
    </a>
  );
}

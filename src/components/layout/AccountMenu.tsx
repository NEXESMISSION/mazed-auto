"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import {
  User, Activity, Receipt, Heart, ClipboardCheck, ShieldCheck, Plus,
  Bell, Settings, LogOut, Loader2,
} from "lucide-react";

type Item = { href: string; label: string; sub?: string; Icon: typeof User };

const ITEMS: Item[] = [
  { href: "/account", label: "Mon compte", sub: "Profil et vérification", Icon: User },
  { href: "/account/listings", label: "Mes annonces", sub: "Publiées, en attente, expirées", Icon: Activity },
  { href: "/account/payments", label: "Mes paiements", sub: "Cautions et reçus", Icon: Receipt },
  { href: "/account/favoris", label: "Favoris", sub: "Vos annonces enregistrées", Icon: Heart },
  ...(false
    ? [{ href: "/account/inspections", label: "Inspections", sub: "Rapports d'expertise", Icon: ClipboardCheck }]
    : []),
  { href: "/account/notifications", label: "Notifications", sub: "Alertes et activité", Icon: Bell },
  { href: "/kyc/status", label: "Vérification (KYC)", sub: "Statut d'identité", Icon: ShieldCheck },
  { href: "/account/settings", label: "Paramètres", sub: "Mot de passe et compte", Icon: Settings },
  { href: "/sell", label: "Vendre une voiture", sub: "Créer une annonce", Icon: Plus },
];

/** Name + email pulled from the Supabase session for the menu header. */
type MenuUser = { email: string | null; name: string | null };

function toMenuUser(u: unknown): MenuUser | null {
  if (!u || typeof u !== "object") return null;
  const user = u as { email?: string | null; user_metadata?: Record<string, unknown> };
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    null;
  return { email: user.email ?? null, name };
}

/**
 * Desktop account control in the header. For signed-in users the avatar
 * opens a dropdown with every account destination + a sign-out shortcut
 * (clears the Supabase session, then hard-redirects to the localized login
 * page). For guests it's just a "Connexion" link.
 */
export function AccountMenu() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<MenuUser | null>(null);
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Resolve auth state once + keep it in sync.
  useEffect(() => {
    const sb = getBrowserSupabase();
    let active = true;
    // Resolve auth + the admin flag (profile role 'admin' shows the admin
    // shortcut, even if the JWT app_metadata claim lags a login behind).
    async function resolve(u: unknown) {
      if (!active) return;
      setAuthed(!!u);
      setUser(toMenuUser(u));
      const id = (u as { id?: string } | null)?.id;
      if (id) {
        const { data: prof } = await sb.from("profiles").select("role").eq("id", id).single();
        if (active) setIsAdmin(prof?.role === "admin");
      } else if (active) {
        setIsAdmin(false);
      }
    }
    sb.auth.getUser().then((res: { data: { user: unknown } }) => resolve(res.data.user));
    const { data: sub } = sb.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => resolve(session?.user ?? null),
    );
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  // Initial for the avatar disc — first letter of the name, falling back
  // to the email, like v1's ProfileMenu avatar.
  const initial = (user?.name ?? user?.email ?? "").trim().charAt(0).toUpperCase();

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus(); // APG: return focus to the trigger on close
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // APG menu keyboard support: move focus into the menu on open, and let
  // Arrow/Home/End rove between items (they're also Tab-reachable).
  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[0]?.focus();
  }, [open]);

  function onMenuKey(e: React.KeyboardEvent) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1 + items.length) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    const locale = window.location.pathname.split("/")[1] || "fr";
    try {
      const sb = getBrowserSupabase();
      await Promise.all([
        sb.auth.signOut(),
        fetch("/api/auth/signout", { method: "POST", headers: { Accept: "application/json" } }),
      ]);
    } finally {
      window.location.href = `/${locale}/login`;
    }
  }

  // Guest → plain login link (matches the avatar footprint).
  if (authed === false) {
    return (
      <Link
        href="/login"
        aria-label="Connexion"
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-[13px] font-semibold text-muted transition-colors hover:border-gold-soft/60 hover:text-foreground"
      >
        <User className="size-4.5" strokeWidth={2} />
        Connexion
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mon compte"
        className={`inline-flex size-10 items-center justify-center rounded-full border transition-colors ${
          open
            ? "border-gold-soft bg-gold-faint text-gold"
            : "border-border text-muted hover:border-gold-soft/60 hover:text-foreground"
        }`}
      >
        {initial ? (
          <span className="text-[15px] font-extrabold text-gold">{initial}</span>
        ) : (
          <User className="size-5" strokeWidth={2} />
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Mon compte"
          onKeyDown={onMenuKey}
          className="absolute end-0 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.45)]"
        >
          {/* Identity header — avatar initial + name + email, like v1's
              ProfileMenu. Hidden until the session resolves. */}
          {user && (
            <div className="mb-1 flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-3">
              <span className="batta-gold-fill flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold shadow-[var(--shadow-gold)]">
                {initial || "·"}
              </span>
              <span className="min-w-0">
                {user.name && (
                  <span className="block truncate text-[13px] font-bold text-foreground">
                    {user.name}
                  </span>
                )}
                {user.email && (
                  <span className="block truncate text-[11.5px] text-muted">{user.email}</span>
                )}
              </span>
            </div>
          )}

          {isAdmin && (
            <Link
              href="/admin/home"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="mb-1 flex items-center gap-3 rounded-xl bg-gold-faint px-3 py-2 ring-1 ring-gold/30 transition-colors hover:bg-gold-faint/80"
            >
              <ShieldCheck className="size-4 shrink-0 text-gold" strokeWidth={2.2} />
              <span className="min-w-0">
                <span className="block text-[13px] font-bold leading-tight text-gold">Console admin</span>
                <span className="block truncate text-[10.5px] leading-tight text-gold/70">Gérer la plateforme</span>
              </span>
            </Link>
          )}

          {ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href as "/account"}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-surface-2"
            >
              <it.Icon className="size-4 shrink-0 text-muted" strokeWidth={2} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-tight text-foreground/85">
                  {it.label}
                </span>
                {it.sub && (
                  <span className="block truncate text-[10.5px] leading-tight text-subtle">
                    {it.sub}
                  </span>
                )}
              </span>
            </Link>
          ))}

          <div aria-hidden className="my-1 h-px bg-border" />

          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-bold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-60"
          >
            {loggingOut ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <LogOut className="size-4 shrink-0" strokeWidth={2.2} />}
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

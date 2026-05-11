"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Bell,
  Gavel,
  LogOut,
  Settings,
  ShieldCheck,
  Tag,
  User as UserIcon,
  Wallet,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/lib/auth";
import type { LucideIcon } from "lucide-react";
import type { AppUser } from "@/lib/auth-shared";

interface Props {
  user: AppUser;
}

/**
 * Avatar pill in the desktop header that opens a small dropdown menu
 * instead of routing straight to /profile. Lets the user reach the most
 * common destinations (profile, my bids, settings, sign-out) without
 * leaving the page they're on. Click-outside + ESC close the menu.
 */
export function ProfileMenu({ user }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { signOut } = useAuth();
  const router = useRouter();

  // Click-outside-to-close. Pointer-up handles touch + mouse uniformly.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const node = wrapperRef.current;
      if (!node) return;
      if (!node.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    router.push("/");
  }

  const displayName =
    `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
    user.email ||
    "Mon compte";

  // KYC chip — quick visual signal at the top of the menu so the user
  // sees their verification state without going to /kyc.
  const kycLabel: Record<typeof user.kycStatus, string> = {
    none: "KYC non démarré",
    pending: "KYC en cours",
    verified: "KYC vérifié",
    rejected: "KYC rejeté",
  };
  const kycTone: Record<typeof user.kycStatus, string> = {
    none: "bg-[var(--surface-2)] text-[var(--foreground-muted)]",
    pending: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    verified: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    rejected: "bg-red-500/15 text-red-300 ring-red-500/30",
  };

  const items: MenuItem[] = [
    {
      icon: UserIcon,
      label: "Mon profil",
      href: "/profile",
      sub: "Voir et modifier",
    },
    { icon: Gavel, label: "Mes enchères", href: "/buyer/bids" },
    { icon: Tag, label: "Mes annonces", href: "/seller/auctions" },
    { icon: Wallet, label: "Mes transactions", href: "/transactions" },
    { icon: Bell, label: "Notifications", href: "/notifications" },
    { icon: Settings, label: "Paramètres", href: "/settings" },
  ];

  if (user.role === "admin") {
    items.unshift({
      icon: ShieldCheck,
      label: "Console admin",
      href: "/admin",
      accent: true,
    });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={displayName}
        className="group flex items-center gap-2 h-10 ps-1 pe-2 rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--gold)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-all"
      >
        <Avatar
          size="sm"
          alt={displayName}
          className="!h-8 !w-8 !border-0 ring-1 ring-[var(--gold-soft)]/40"
        />
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            user.kycStatus === "verified"
              ? "bg-emerald-400"
              : user.kycStatus === "pending"
              ? "bg-amber-400"
              : "bg-[var(--foreground-subtle)]"
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu du compte"
          className="absolute end-0 mt-2 w-72 rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--border)] shadow-[0_20px_60px_-10px_rgba(0,0,0,0.65)] overflow-hidden z-50 animate-fade-in"
        >
          {/* Header — name + email + KYC chip */}
          <div className="px-4 pt-4 pb-3 bg-gradient-to-b from-[var(--surface-2)] to-[var(--surface)]">
            <div className="flex items-center gap-3">
              <Avatar
                size="md"
                alt={displayName}
                className="ring-1 ring-[var(--gold-soft)]/40"
              />
              <div className="min-w-0 flex-1">
                <div className="font-extrabold truncate">{displayName}</div>
                <div className="text-[12px] text-[var(--foreground-muted)] truncate">
                  {user.email}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2 h-6 rounded-full ring-1 text-[10px] font-bold uppercase tracking-wider ${kycTone[user.kycStatus]}`}
              >
                <ShieldCheck className="h-3 w-3" />
                {kycLabel[user.kycStatus]}
              </span>
              {user.kycStatus !== "verified" && (
                <Link
                  href="/kyc"
                  onClick={() => setOpen(false)}
                  className="text-[11px] font-bold text-[var(--gold)] hover:underline"
                >
                  Vérifier →
                </Link>
              )}
            </div>
          </div>

          <div className="h-px bg-[var(--border)]" />

          {/* Action list */}
          <ul className="py-1.5">
            {items.map((it) => (
              <li key={it.href}>
                <Link
                  href={it.href}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors"
                >
                  <span
                    className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${
                      it.accent
                        ? "bg-[var(--gold)] text-black"
                        : "bg-[var(--surface-2)] text-[var(--foreground-muted)]"
                    }`}
                  >
                    <it.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">
                      {it.label}
                    </span>
                    {it.sub && (
                      <span className="block text-[11px] text-[var(--foreground-muted)]">
                        {it.sub}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="h-px bg-[var(--border)]" />

          <button
            type="button"
            onClick={handleSignOut}
            role="menuitem"
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 transition-colors text-red-300 hover:text-red-200"
          >
            <span className="h-8 w-8 shrink-0 rounded-full bg-red-500/15 flex items-center justify-center">
              <LogOut className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold">Se déconnecter</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface MenuItem {
  icon: LucideIcon;
  label: string;
  href: string;
  sub?: string;
  accent?: boolean;
}

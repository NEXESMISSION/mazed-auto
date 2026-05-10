"use client";

import { useState, useTransition } from "react";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { Search, ChevronLeft, Ban, Shield } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface User {
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  username: string | null;
  role: string;
  admin_role: string | null;
  kyc_status: string;
  trust_score: number;
  city: string | null;
  is_pro: boolean;
  is_active: boolean;
  is_banned: boolean;
  bid_count: number;
  auction_count: number;
  created_at: string;
}

interface Props {
  initialQuery: string;
  initialRole: string;
  initialKyc: string;
  initialBannedOnly: boolean;
  users: User[];
}

const ROLE_OPTS = [
  { value: "all", label: "Tous" },
  { value: "buyer", label: "Acheteurs" },
  { value: "seller", label: "Vendeurs" },
  { value: "admin", label: "Admins" },
];
const KYC_OPTS = [
  { value: "all", label: "KYC : tous" },
  { value: "verified", label: "Vérifié" },
  { value: "pending", label: "En attente" },
  { value: "rejected", label: "Refusé" },
  { value: "none", label: "Non démarré" },
];

export function UsersBrowser({
  initialQuery,
  initialRole,
  initialKyc,
  initialBannedOnly,
  users,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(initialQuery);
  const [role, setRole] = useState(initialRole);
  const [kyc, setKyc] = useState(initialKyc);
  const [bannedOnly, setBannedOnly] = useState(initialBannedOnly);

  function apply(patch: {
    q?: string;
    role?: string;
    kyc?: string;
    bannedOnly?: boolean;
  }) {
    const params = new URLSearchParams();
    const nextQ = patch.q ?? q;
    const nextRole = patch.role ?? role;
    const nextKyc = patch.kyc ?? kyc;
    const nextBanned = patch.bannedOnly ?? bannedOnly;
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextRole !== "all") params.set("role", nextRole);
    if (nextKyc !== "all") params.set("kyc", nextKyc);
    if (nextBanned) params.set("banned", "1");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({});
        }}
        className="flex flex-col md:flex-row gap-2"
      >
        <Input
          placeholder="Email, nom, @username, téléphone…"
          iconLeft={<Search className="h-4 w-4" />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 h-11 text-sm"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            apply({ role: e.target.value });
          }}
        >
          {ROLE_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 h-11 text-sm"
          value={kyc}
          onChange={(e) => {
            setKyc(e.target.value);
            apply({ kyc: e.target.value });
          }}
        >
          {KYC_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant={bannedOnly ? "primary" : "secondary"}
          size="md"
          onClick={() => {
            setBannedOnly(!bannedOnly);
            apply({ bannedOnly: !bannedOnly });
          }}
        >
          <Ban className="h-4 w-4" />
          Suspendus
        </Button>
        <Button type="submit" size="md" disabled={pending}>
          {pending ? "…" : "Rechercher"}
        </Button>
      </form>

      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_1.2fr_0.8fr_0.6fr_0.6fr_0.8fr_60px] px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] text-xs font-bold text-[var(--foreground-muted)]">
          <div>Utilisateur</div>
          <div>Email / Téléphone</div>
          <div>Rôle</div>
          <div>KYC</div>
          <div>Trust</div>
          <div>Activité</div>
          <div></div>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {users.length === 0 && (
            <div className="p-12 text-center text-sm text-[var(--foreground-muted)]">
              Aucun utilisateur correspondant.
            </div>
          )}
          {users.map((u) => (
            <Link
              key={u.id}
              href={`/admin/users/${u.id}`}
              className="grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1.2fr_0.8fr_0.6fr_0.6fr_0.8fr_60px] gap-3 p-4 items-center hover:bg-[var(--surface-2)] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar size="md" alt={u.display_name ?? "?"} />
                <div className="min-w-0">
                  <div className="font-bold text-sm line-clamp-1 flex items-center gap-2">
                    {u.display_name ?? "(sans nom)"}
                    {u.is_pro && (
                      <Badge size="sm" variant="goldFilled">
                        Pro
                      </Badge>
                    )}
                    {u.is_banned && (
                      <Badge size="sm" variant="danger">
                        suspendu
                      </Badge>
                    )}
                    {u.admin_role && (
                      <Badge size="sm" variant="gold">
                        <Shield className="h-3 w-3" />
                        {u.admin_role}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-[var(--foreground-muted)]">
                    {u.username ? `@${u.username}` : u.id.slice(0, 8)}
                  </div>
                </div>
              </div>
              <div className="hidden md:block min-w-0">
                <div className="text-xs text-[var(--foreground-muted)] truncate">
                  {u.email ?? "—"}
                </div>
                <div className="text-xs text-[var(--foreground-muted)] truncate tabular-nums">
                  {u.phone ?? ""}
                </div>
              </div>
              <div className="hidden md:block text-xs">
                <Badge
                  size="sm"
                  variant={
                    u.role === "admin"
                      ? "gold"
                      : u.role === "seller"
                        ? "default"
                        : "outline"
                  }
                >
                  {u.role}
                </Badge>
              </div>
              <div className="hidden md:block">
                <Badge
                  size="sm"
                  variant={
                    u.kyc_status === "verified"
                      ? "success"
                      : u.kyc_status === "pending"
                        ? "warning"
                        : u.kyc_status === "rejected"
                          ? "danger"
                          : "default"
                  }
                >
                  {u.kyc_status}
                </Badge>
              </div>
              <div className="hidden md:block font-bold text-[var(--gold)] tabular-nums text-sm">
                {u.trust_score}
              </div>
              <div className="hidden md:block text-xs text-[var(--foreground-muted)] tabular-nums">
                {u.bid_count} ench. · {u.auction_count} annonces
              </div>
              <span className="h-8 w-8 rounded-full hover:bg-[var(--surface-3)] flex items-center justify-center justify-self-end text-[var(--foreground-muted)]">
                <ChevronLeft className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/Toast";
import { AdminButton } from "@/components/admin/AdminButton";
import { formatTND } from "@/lib/utils";
import { purchasablePacks, badgeProduct, type Product } from "@/lib/products";
import type { SellerRow } from "./page";
import { Search, BadgeCheck, Package, ShieldOff, Phone } from "lucide-react";

/**
 * One seller at a time: find them, see what they hold, act.
 *
 * The list is deliberately not paginated — this is a few hundred rows at most,
 * and an admin looking for "Karim" wants to type three letters and see him, not
 * page through an alphabet.
 */
export function SellerDesk({
  sellers,
  products,
}: {
  sellers: SellerRow[];
  products: Product[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const packs = useMemo(() => purchasablePacks(products), [products]);
  const badge = useMemo(() => badgeProduct(products), [products]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sellers.slice(0, 40);
    return sellers
      .filter(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          (s.phone ?? "").includes(needle),
      )
      .slice(0, 40);
  }, [q, sellers]);

  function act(sellerId: string, body: Record<string, unknown>, okMsg: string) {
    start(async () => {
      const res = await fetch(`/api/admin/sellers/${sellerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast(j.detail ?? j.error ?? "Échec de l'action.", "error");
        return;
      }
      toast(okMsg, "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <label className="relative block max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher un vendeur (nom ou téléphone)"
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-[13px] text-foreground placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold-soft"
        />
      </label>

      {packs.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-surface-2/50 p-3 text-[12.5px] text-muted">
          Aucun pack actif. Créez-en un dans <strong>Tarifs</strong> pour pouvoir créditer un
          vendeur.
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((s) => {
          const open = openId === s.id;
          return (
            <div key={s.id} className="rounded-xl border border-border bg-surface">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : s.id)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 p-3.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold text-foreground">{s.name}</span>
                    {s.badge && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold-faint px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-gold ring-1 ring-gold-soft">
                        <BadgeCheck className="size-3" /> vérifié
                      </span>
                    )}
                    {s.role !== "individual" && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-muted ring-1 ring-border">
                        {s.role}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11.5px] text-muted">
                    {s.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" /> {s.phone}
                      </span>
                    ) : (
                      <span className="text-[var(--accent-deep)]">aucun téléphone</span>
                    )}
                    <span>{s.listings} annonce{s.listings > 1 ? "s" : ""}</span>
                  </span>
                </span>

                <span className="batta-tabular text-right">
                  <span className="block text-[15px] font-extrabold text-foreground">
                    {s.creditsLeft}
                  </span>
                  <span className="block text-[10px] uppercase tracking-[0.1em] text-muted">
                    publications
                  </span>
                </span>
              </button>

              {open && (
                <div className="space-y-4 border-t border-border p-3.5">
                  {/* ── Credit a pack ── */}
                  <div>
                    <h3 className="inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted">
                      <Package className="size-3.5" /> Créditer un forfait
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {packs.map((p) => (
                        <AdminButton
                          key={p.id}
                          variant="ghost"
                          pending={pending}
                          onClick={() =>
                            act(
                              s.id,
                              { action: "grant_credits", product_id: p.id },
                              `${p.listingQuota} publication(s) créditée(s) à ${s.name}.`,
                            )
                          }
                        >
                          {p.nameFr} · {formatTND(p.price, "fr")} TND
                        </AdminButton>
                      ))}
                      {packs.length === 0 && (
                        <span className="text-[12px] text-muted">— aucun pack actif —</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted">
                      Créditez après avoir validé le paiement. Les publications sont valables
                      12 mois.
                    </p>
                  </div>

                  {/* ── Badge ── */}
                  <div className="border-t border-border pt-3">
                    <h3 className="inline-flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-muted">
                      <BadgeCheck className="size-3.5" /> Badge vendeur vérifié
                    </h3>

                    {s.badge ? (
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <span className="text-[12.5px] text-foreground">
                          Actif jusqu&apos;au{" "}
                          <strong>
                            {new Date(s.badge.expiresAt).toLocaleDateString("fr-FR")}
                          </strong>
                        </span>
                        <RevokeButton
                          pending={pending}
                          onRevoke={(reason) =>
                            act(
                              s.id,
                              { action: "revoke_badge", reason },
                              `Badge retiré à ${s.name}.`,
                            )
                          }
                        />
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <AdminButton
                          variant="success"
                          pending={pending}
                          onClick={() =>
                            act(
                              s.id,
                              { action: "grant_badge", product_id: badge?.id ?? null, months: 12 },
                              `Badge accordé à ${s.name} pour 12 mois.`,
                            )
                          }
                        >
                          <BadgeCheck className="size-3.5" /> Accorder pour 12 mois
                        </AdminButton>
                        <span className="text-[11px] text-muted">
                          {badge
                            ? `Vendu ${formatTND(badge.price, "fr")} TND — n'accordez qu'après vérification.`
                            : "Aucun tarif de badge actif : le badge peut être accordé, mais rien n'est facturé."}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-[13px] text-muted">Aucun vendeur ne correspond.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Revoking asks for a reason before it will fire — the API refuses without one.
 * Whoever reads this row in six months needs to know why the badge went.
 */
function RevokeButton({
  pending,
  onRevoke,
}: {
  pending: boolean;
  onRevoke: (reason: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  if (!asking) {
    return (
      <AdminButton variant="dangerSoft" onClick={() => setAsking(true)}>
        <ShieldOff className="size-3.5" /> Retirer
      </AdminButton>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motif du retrait"
        autoFocus
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-foreground placeholder:text-muted focus:border-gold focus:outline-none"
      />
      <AdminButton
        variant="danger"
        pending={pending}
        disabled={!reason.trim()}
        disabledReason={!reason.trim() ? "Indiquez un motif" : undefined}
        onClick={() => { onRevoke(reason.trim()); setAsking(false); setReason(""); }}
      >
        Confirmer
      </AdminButton>
      <AdminButton variant="ghost" onClick={() => { setAsking(false); setReason(""); }}>
        Annuler
      </AdminButton>
    </span>
  );
}

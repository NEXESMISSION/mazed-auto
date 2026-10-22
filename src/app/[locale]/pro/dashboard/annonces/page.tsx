/* eslint-disable react-hooks/purity -- Server Component.
 * Reads the clock once per request for "expires in N days"; there is no
 * client render to replay. */
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getProContext } from "@/lib/shops/proContext";
import { CAN_EDIT_SHOP, quotaStatus } from "@/lib/shops/server";
import { boostForSale } from "@/lib/shops/plans";
import { coverPhoto } from "@/lib/listingCover";
import { formatTND } from "@/lib/utils";
import type { ListingType } from "@/lib/publication";
import { ListingImage } from "@/components/media/ListingImage";
import { RenewButton } from "@/app/[locale]/account/listings/RenewButton";
import { WithdrawButton } from "@/app/[locale]/account/listings/WithdrawButton";
import { PostButton } from "../PostButton";
import { Eye, ImageOff, Pause, PencilLine, Phone, Play, Plus, Rocket } from "lucide-react";

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Brouillon", tone: "bg-surface-2 text-muted ring-1 ring-border" },
  pending_payment: { label: "À payer", tone: "batta-tone-warn" },
  pending_review: { label: "Vérification", tone: "batta-tone-warn" },
  published: { label: "En ligne", tone: "batta-tone-ok" },
  rejected: { label: "À corriger", tone: "batta-tone-bad" },
  expired: { label: "Expirée", tone: "bg-surface-2 text-muted ring-1 ring-border" },
  archived: { label: "Retirée", tone: "bg-surface-2 text-muted ring-1 ring-border" },
  sold: { label: "Vendue", tone: "batta-tone-ok" },
  paused: { label: "En pause", tone: "batta-tone-warn" },
};

const PAUSED_BECAUSE: Record<string, string> = {
  owner: "mise en pause par vous",
  subscription_expired: "abonnement terminé — elle revient dès le prochain paiement",
  over_limit: "au-delà de la limite de la formule",
};

const ORDER = ["rejected", "pending_review", "published", "draft", "paused", "expired", "archived", "sold", "pending_payment"];

type Row = {
  id: string; title: string; status: string; price: number | null; price_on_request: boolean;
  price_unit: string; seller_id: string; rejection_reason: string | null; expires_at: string | null;
  view_count: number; contact_reveal_count: number;
  paused_reason: string | null; sponsored_until: string | null;
  photos: { storage_path: string; sort_order: number; is_cover?: boolean | null }[] | null;
};

/**
 * Annonces de la boutique — every annonce filed under the shop, whichever
 * member published it, with the one action each needs. Renewing and
 * withdrawing go through the same routes as personal annonces, which check
 * shop membership themselves; a renewal is covered by the subscription.
 */
export default async function ProListingsPage() {
  const ctx = await getProContext();
  if (ctx.kind !== "shop") return null;
  const { admin, user, shop, role } = ctx;
  const canManage = CAN_EDIT_SHOP.includes(role);
  const locale = await getLocale();

  const [{ data }, quota, boost] = await Promise.all([
    admin
      .from("listings")
      .select(
        `id, title, status, price, price_on_request, price_unit, seller_id, rejection_reason, expires_at,
         view_count, contact_reveal_count, paused_reason, sponsored_until, photos:listing_photos (storage_path, sort_order, is_cover)`,
      )
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false }),
    quotaStatus(admin, user.id, shop.id, shop.activity_type as ListingType),
    boostForSale(admin),
  ]);
  const rows = ((data ?? []) as unknown as Row[]).sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status),
  );
  const now = Date.now();
  const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          <span className="batta-tabular font-extrabold text-foreground">{quota.used} / {quota.limit}</span>{" "}
          {quota.bucket === "parts" ? "pièces" : "véhicules"} en ligne · {rows.length} annonce{rows.length > 1 ? "s" : ""} au total
        </p>
        <Link href={"/annonces/nouvelle" as never} className="batta-btn-luxe tap-target px-4 py-2.5 text-[13px]">
          <Plus className="size-4" /> Nouvelle annonce
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center text-[13px] text-muted">
          Aucune annonce pour l&apos;instant. Les annonces que vous publiez sont rattachées à la boutique.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {rows.map((l) => {
            const st = STATUS[l.status] ?? { label: l.status, tone: "bg-surface-2 text-muted" };
            const cover = coverPhoto(l.photos);
            const days = l.status === "published" && l.expires_at
              ? Math.ceil((new Date(l.expires_at).getTime() - now) / 86_400_000)
              : null;
            return (
              <li key={l.id} className="flex gap-3 rounded-2xl border border-border bg-surface p-3">
                <Link
                  href={`/annonces/${l.id}` as never}
                  className="relative size-[72px] shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border"
                >
                  {cover ? (
                    <ListingImage path={cover.storage_path} alt="" sizes="72px" />
                  ) : (
                    <span className="grid size-full place-items-center text-muted"><ImageOff className="size-5" /></span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${st.tone}`}>{st.label}</span>
                    {l.sponsored_until && new Date(l.sponsored_until).getTime() > now && (
                      <span className="rounded-full bg-gold-faint px-2 py-0.5 text-[10.5px] font-extrabold text-gold ring-1 ring-gold-soft">
                        Sponsorisée jusqu&apos;au {day(l.sponsored_until)}
                      </span>
                    )}
                    {days != null && days <= 7 && (
                      <span className="text-[11px] font-bold text-[var(--tone-warn)]">expire dans {Math.max(days, 0)} j</span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[13.5px] font-bold">{l.title}</p>
                  <p className="batta-tabular text-[12.5px] text-muted">
                    {l.price_on_request || l.price == null
                      ? "Sur demande"
                      : `${formatTND(Number(l.price), locale)} TND${l.price_unit === "day" ? " / jour" : ""}`}
                    <span className="ms-3 inline-flex items-center gap-1"><Eye className="size-3" /> {l.view_count}</span>
                    <span className="ms-2 inline-flex items-center gap-1"><Phone className="size-3" /> {l.contact_reveal_count}</span>
                  </p>
                  {l.status === "paused" && l.paused_reason && (
                    <p className="mt-1 text-[11.5px] text-muted">En pause : {PAUSED_BECAUSE[l.paused_reason] ?? l.paused_reason}</p>
                  )}
                  {l.status === "rejected" && l.rejection_reason && (
                    <p className="mt-1 text-[11.5px] text-[var(--danger)]">Refusée : {l.rejection_reason}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {["published", "pending_review"].includes(l.status) && (
                      <WithdrawButton listingId={l.id} title={l.title} />
                    )}
                    {canManage && l.status === "published" && boost && (
                      <PostButton
                        url="/api/pro/checkout"
                        body={{ listing_id: l.id, product: "boost-7j" }}
                        className="inline-flex items-center gap-1 text-[12px] font-bold text-gold hover:underline"
                      >
                        <Rocket className="size-3.5" /> Booster {boost.days} j · {formatTND(boost.price, locale)} TND
                      </PostButton>
                    )}
                    {canManage && ["published", "pending_review"].includes(l.status) && (
                      <PostButton
                        url={`/api/pro/listings/${l.id}/pause`}
                        success="Annonce mise en pause."
                        className="inline-flex items-center gap-1 text-[12px] font-bold text-muted hover:text-foreground"
                      >
                        <Pause className="size-3.5" /> Pause
                      </PostButton>
                    )}
                    {canManage && l.status === "paused" && (
                      <PostButton
                        url={`/api/pro/listings/${l.id}/resume`}
                        success="Annonce réactivée."
                        className="inline-flex items-center gap-1 text-[12px] font-bold text-gold hover:underline"
                      >
                        <Play className="size-3.5" /> Réactiver
                      </PostButton>
                    )}
                    {["expired", "archived", "sold"].includes(l.status) && (
                      <RenewButton listingId={l.id} usesCredit={false} feeLabel="incluse dans l'abonnement" />
                    )}
                    {l.status === "draft" && l.seller_id === user.id && (
                      <Link href={"/annonces/nouvelle" as never} className="inline-flex items-center gap-1 text-[12px] font-bold text-gold hover:underline">
                        <PencilLine className="size-3.5" /> Reprendre
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-[11.5px] text-muted">
        <Eye className="inline size-3" /> vues · <Phone className="inline size-3" /> numéros demandés. Nous ne suivons pas les ventes :
        elles se concluent directement entre vous et l&apos;acheteur.
      </p>
    </div>
  );
}

import { redirect } from "next/navigation";
import { coverPhoto } from "@/lib/listingCover";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { ListingImage } from "@/components/media/ListingImage";
import { formatTND } from "@/lib/utils";
import { Plus, Ticket, ImageOff, Clock } from "lucide-react";
import { RenewButton } from "./RenewButton";
import { PRODUCT_SELECT, isFree, resolveListingFee, toProduct, type Product } from "@/lib/products";
import { formatTND as fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Mes annonces — what the seller has, and what is waiting on whom.
 *
 * Every notification the v3 flow sends points here (submitted, published,
 * rejected, expiring, credits granted), so it exists now rather than in Phase 5:
 * a notification that leads to a 404 is worse than no notification.
 */

const STATUS: Record<string, { label: string; tone: string; hint?: string }> = {
  draft:           { label: "Brouillon",   tone: "bg-surface-2 text-muted ring-1 ring-border", hint: "Pas encore envoyée." },
  pending_payment: { label: "À payer",     tone: "batta-tone-warn", hint: "Réglez les frais pour lancer la vérification." },
  pending_review:  { label: "Vérification", tone: "batta-tone-warn", hint: "Notre équipe la contrôle — moins de 24 h." },
  published:       { label: "En ligne",    tone: "batta-tone-ok" },
  rejected:        { label: "À corriger",  tone: "batta-tone-bad" },
  expired:         { label: "Expirée",     tone: "bg-surface-2 text-muted ring-1 ring-border", hint: "Renouvelez-la pour la remettre en ligne." },
  sold:            { label: "Vendue",      tone: "batta-tone-ok" },
  archived:        { label: "Retirée",     tone: "bg-surface-2 text-muted ring-1 ring-border" },
};

export default async function MyListingsPage() {
  const locale = await getLocale();
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/account/listings`)}`);
  }

  const admin = getServiceSupabase();
  const db = admin ?? supabase;

  const [listRes, creditRes, prodRes] = await Promise.all([
    db
      .from("listings")
      .select(
        `id, title, price, price_on_request, status, rejection_reason, published_at,
         expires_at, created_at, category_id, category:categories (label_fr),
         photos:listing_photos (storage_path, sort_order, is_cover)`,
      )
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("seller_credits")
      .select("quota_total, quota_used, expires_at, status")
      .eq("seller_id", user.id)
      .eq("status", "active"),
    db.from("products").select(PRODUCT_SELECT).eq("is_active", true),
  ]);

  const products: Product[] = (prodRes.data ?? []).map((r) =>
    toProduct(r as Parameters<typeof toProduct>[0]),
  );
  const renewalProduct = products.find((p) => p.kind === "renewal") ?? null;

  // Category → parent, so a price set on a parent (« Pièces de rechange » at 0)
  // resolves for its children the same way the API does it.
  const { data: catRows } = await db.from("categories").select("id, parent_id");
  const parentOf = new Map(
    (catRows ?? []).map((c) => [c.id as string, (c.parent_id as string | null) ?? null]),
  );

  const now = Date.now();
  const creditsLeft = (creditRes.data ?? []).reduce((n, c) => {
    if (new Date(c.expires_at as string).getTime() <= now) return n;
    return n + Math.max(0, (c.quota_total as number) - (c.quota_used as number));
  }, 0);

  type Row = {
    id: string; title: string; price: number | null; price_on_request: boolean;
    status: string; rejection_reason: string | null; published_at: string | null;
    expires_at: string | null; created_at: string;
    category: { label_fr: string } | { label_fr: string }[] | null;
    category_id: string;
    photos: { storage_path: string; sort_order: number; is_cover?: boolean | null }[] | null;
  };
  const rows = (listRes.data ?? []) as Row[];

  // The four numbers a seller opens this page to see.
  const counts = {
    published: rows.filter((r) => r.status === "published").length,
    review: rows.filter((r) => r.status === "pending_review" || r.status === "pending_payment").length,
    action: rows.filter((r) => r.status === "rejected" || r.status === "draft").length,
    expired: rows.filter((r) => r.status === "expired" || r.status === "archived").length,
  };

  // What renewing this listing costs. Mirrors the renew route exactly,
  // including its exception: a category that publishes for free renews for
  // free, so a part is never quoted 15 TND.
  const renewLabel = (l: Row): string | null => {
    const categoryFee = resolveListingFee(products, l.category_id, parentOf.get(l.category_id) ?? null);
    const p = isFree(categoryFee) ? categoryFee : renewalProduct ?? categoryFee;
    if (!p) return null;
    return p.price <= 0 ? "Gratuit" : `${fmt(p.price, locale)} TND`;
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 lg:max-w-5xl lg:px-8 lg:py-10">
      {/* ── Header ────────────────────────────────────────────────────────
          Phone: title, count, and the one button that matters, stacked.
          Desktop: the same row, but the button sits opposite the title
          instead of under it, because there is room. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight lg:text-[30px]">Mes annonces</h1>
          <p className="mt-1 text-[13px] text-muted">
            {rows.length === 0
              ? "Vous n'avez pas encore publié."
              : `${rows.length} annonce${rows.length > 1 ? "s" : ""}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {creditsLeft > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-gold-faint px-3 py-2 text-[12.5px] font-bold text-gold ring-1 ring-gold-soft">
              <Ticket className="size-4" />
              {creditsLeft} restante{creditsLeft > 1 ? "s" : ""}
            </span>
          )}
          <Link href={"/annonces/nouvelle" as never} className="batta-btn-luxe tap-target px-4 py-2.5 text-[13px]">
            <Plus className="size-4" /> Publier
          </Link>
        </div>
      </div>

      {/* ── What needs the seller ─────────────────────────────────────────
          A seller opens this page to answer one question: is anything
          waiting on me? Four counts answer it before they read a single
          card. Two columns on a phone, four in a row from sm up. */}
      {rows.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { label: "En ligne", n: counts.published, tone: "text-emerald-400" },
            { label: "En vérification", n: counts.review, tone: "text-amber-400" },
            { label: "À corriger", n: counts.action, tone: "text-[var(--danger)]" },
            { label: "Expirées", n: counts.expired, tone: "text-muted" },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl border border-border bg-surface px-3.5 py-3">
              <div className={`batta-tabular text-[22px] font-extrabold leading-none ${c.tone}`}>{c.n}</div>
              <div className="mt-1 text-[11px] font-semibold text-muted">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── PHONE · one card per annonce ─────────────────────────────────
          A thumbnail you can recognise at a glance, the status, and only
          the action that applies. Everything else is noise on a 6" screen. */}
      <div className="mt-5 space-y-3 lg:hidden">
        {rows.map((l) => {
          const st = STATUS[l.status] ?? { label: l.status, tone: "bg-surface-2 text-muted" };
          const cat = Array.isArray(l.category) ? l.category[0] : l.category;
          const cover = coverPhoto(l.photos);
          return (
            <article key={l.id} className="flex gap-3 rounded-2xl border border-border bg-surface p-3">
              <Link href={`/annonces/${l.id}` as never} className="size-20 shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border">
                {cover ? (
                  <ListingImage path={cover.storage_path} alt="" sizes="80px" />
                ) : (
                  <span className="grid size-full place-items-center text-muted"><ImageOff className="size-5" /></span>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] ${st.tone}`}>
                    {st.label}
                  </span>
                  <span className="text-[11px] text-muted">{cat?.label_fr ?? "—"}</span>
                </div>
                <Link href={`/annonces/${l.id}` as never} className="mt-1 block truncate text-[14.5px] font-bold text-foreground">
                  {l.title}
                </Link>
                <p className="batta-tabular mt-0.5 text-[13px] font-semibold text-foreground">
                  {l.price_on_request || l.price == null
                    ? "Prix sur demande"
                    : `${formatTND(Number(l.price), locale)} TND`}
                </p>
                {st.hint && <p className="mt-1 text-[11.5px] text-muted">{st.hint}</p>}
                {l.rejection_reason && (
                  <p className="mt-1 rounded-lg bg-[var(--accent-faint)] px-2 py-1 text-[11.5px] text-[var(--accent-deep)]">
                    {l.rejection_reason}
                  </p>
                )}
                {l.status === "published" && l.expires_at && (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-muted">
                    <Clock className="size-3" />
                    Jusqu&apos;au {new Date(l.expires_at).toLocaleDateString("fr-FR")}
                  </p>
                )}
                {["expired", "archived", "sold"].includes(l.status) && (
                  <RenewButton listingId={l.id} usesCredit={creditsLeft > 0} feeLabel={renewLabel(l)} />
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* ── DESKTOP · a table, because this is a management screen ────────
          The card list stretched to 1400px was a ribbon of 80px thumbnails
          with an ocean of empty space beside it. At this width the seller
          wants to compare rows — status, price, dates — so they get
          columns, aligned numbers, and a sticky header. */}
      <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-surface lg:block">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-[0.14em] text-muted">
            <tr>
              <th className="px-4 py-3 text-start font-extrabold">Annonce</th>
              <th className="px-3 py-3 text-start font-extrabold">Statut</th>
              <th className="px-3 py-3 text-end font-extrabold">Prix</th>
              <th className="px-3 py-3 text-start font-extrabold">Expire</th>
              <th className="px-4 py-3 text-end font-extrabold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((l) => {
              const st = STATUS[l.status] ?? { label: l.status, tone: "bg-surface-2 text-muted" };
              const cat = Array.isArray(l.category) ? l.category[0] : l.category;
              const cover = coverPhoto(l.photos);
              return (
                <tr key={l.id} className="align-middle transition hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/annonces/${l.id}` as never} className="size-12 shrink-0 overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border">
                        {cover ? (
                          <ListingImage path={cover.storage_path} alt="" sizes="48px" />
                        ) : (
                          <span className="grid size-full place-items-center text-muted"><ImageOff className="size-4" /></span>
                        )}
                      </Link>
                      <div className="min-w-0">
                        <Link href={`/annonces/${l.id}` as never} className="block truncate font-bold text-foreground hover:text-gold">
                          {l.title}
                        </Link>
                        <div className="truncate text-[11.5px] text-muted">{cat?.label_fr ?? "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] ${st.tone}`}>
                      {st.label}
                    </span>
                    {l.rejection_reason && (
                      <div className="mt-1 max-w-[22ch] truncate text-[11px] text-[var(--accent-deep)]" title={l.rejection_reason}>
                        {l.rejection_reason}
                      </div>
                    )}
                    {!l.rejection_reason && st.hint && (
                      <div className="mt-1 max-w-[24ch] text-[11px] text-muted">{st.hint}</div>
                    )}
                  </td>
                  <td className="batta-tabular px-3 py-3 text-end font-semibold text-foreground">
                    {l.price_on_request || l.price == null
                      ? "Sur demande"
                      : `${formatTND(Number(l.price), locale)} TND`}
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {l.status === "published" && l.expires_at
                      ? new Date(l.expires_at).toLocaleDateString("fr-FR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {["expired", "archived", "sold"].includes(l.status) ? (
                      <RenewButton listingId={l.id} usesCredit={creditsLeft > 0} feeLabel={renewLabel(l)} />
                    ) : (
                      <Link href={`/annonces/${l.id}` as never} className="text-[12.5px] font-bold text-gold hover:underline">
                        Voir →
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <div className="mt-5 rounded-2xl border border-dashed border-border bg-surface-2/40 p-8 text-center lg:p-14">
          <p className="text-[13px] text-muted">
            Publiez votre première annonce — voiture ou pièce de rechange.
          </p>
          <Link href={"/annonces/nouvelle" as never} className="batta-btn-luxe tap-target mt-4 inline-flex px-5 py-2.5 text-[13px]">
            <Plus className="size-4" /> Publier une annonce
          </Link>
        </div>
      )}
    </main>
  );
}

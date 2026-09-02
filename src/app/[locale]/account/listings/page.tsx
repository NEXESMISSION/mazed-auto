import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import { formatTND } from "@/lib/utils";
import { Plus, Ticket, ImageOff, Clock } from "lucide-react";
import { RenewButton } from "./RenewButton";
import { PRODUCT_SELECT, resolveListingFee, toProduct, type Product } from "@/lib/products";
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
         photos:listing_photos (storage_path, sort_order)`,
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
    photos: { storage_path: string; sort_order: number }[] | null;
  };
  const rows = (listRes.data ?? []) as Row[];

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 lg:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Mes annonces</h1>
          <p className="mt-1 text-[13px] text-muted">
            {rows.length === 0
              ? "Vous n'avez pas encore publié."
              : `${rows.length} annonce${rows.length > 1 ? "s" : ""}.`}
          </p>
        </div>
        <Link href={"/annonces/nouvelle" as never} className="batta-btn-luxe tap-target px-4 py-2.5 text-[13px]">
          <Plus className="size-4" /> Publier
        </Link>
      </div>

      {creditsLeft > 0 && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gold-faint px-3.5 py-2.5 text-[13px] font-bold text-gold ring-1 ring-gold-soft">
          <Ticket className="size-4" />
          {creditsLeft} publication{creditsLeft > 1 ? "s" : ""} dans votre forfait
        </div>
      )}

      <div className="mt-5 space-y-3">
        {rows.map((l) => {
          const st = STATUS[l.status] ?? { label: l.status, tone: "bg-surface-2 text-muted" };
          const cat = Array.isArray(l.category) ? l.category[0] : l.category;
          const cover = (l.photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)[0];
          return (
            <article key={l.id} className="flex gap-3 rounded-2xl border border-border bg-surface p-3">
              <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={propertyPhotoUrl(cover.storage_path)} alt="" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-muted"><ImageOff className="size-5" /></span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] ${st.tone}`}>
                    {st.label}
                  </span>
                  <span className="text-[11px] text-muted">{cat?.label_fr ?? "—"}</span>
                </div>
                <h2 className="mt-1 truncate text-[14.5px] font-bold text-foreground">{l.title}</h2>
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
                  <RenewButton
                    listingId={l.id}
                    usesCredit={creditsLeft > 0}
                    feeLabel={(() => {
                      const p =
                        renewalProduct ?? resolveListingFee(products, l.category_id);
                      return p ? `${fmt(p.price, locale)} TND` : null;
                    })()}
                  />
                )}
              </div>
            </article>
          );
        })}

        {rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface-2/40 p-8 text-center">
            <p className="text-[13px] text-muted">
              Publiez votre première annonce — voiture ou pièce de rechange.
            </p>
            <Link href={"/annonces/nouvelle" as never} className="batta-btn-luxe tap-target mt-4 inline-flex px-5 py-2.5 text-[13px]">
              <Plus className="size-4" /> Publier une annonce
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import { formatTND } from "@/lib/utils";
import { GOVERNORATES } from "@/lib/governorates";
import { AnnonceFilters } from "./AnnonceFilters";
import { BadgeCheck, ImageOff, MapPin, Wrench, Car } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Toutes les annonces — the catalog.
 *
 * Two things make this page different from the v2 explore grid:
 *
 *   1. It covers TWO kinds of thing. The category switch (Véhicules ⇄ Pièces)
 *      is the first control, because a buyer is looking for one or the other,
 *      never both.
 *   2. It answers the parts question directly: "des plaquettes pour ma Clio 5
 *      de 2020". `listing_fitments` is joined and filtered on make/model/year,
 *      which no amount of full-text search over a description does reliably.
 */

type SearchParams = {
  kind?: string;        // vehicle | part
  cat?: string;         // category id
  gov?: string;
  q?: string;
  make?: string;
  model?: string;
  year?: string;
  max?: string;
};

type ListingRow = {
  id: string; title: string; price: number | null; price_on_request: boolean;
  negotiable: boolean; governorate: string; condition: string | null;
  published_at: string | null; seller_id: string;
  category: { label_fr: string; kind: string } | { label_fr: string; kind: string }[] | null;
  photos: { storage_path: string; sort_order: number }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default async function AnnoncesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const admin = getServiceSupabase();

  if (!admin) {
    return <main className="px-4 py-16 text-center text-[13px] text-muted">Service indisponible.</main>;
  }

  const { data: catRows } = await admin
    .from("categories")
    .select("id, parent_id, label_fr, kind, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  type Cat = { id: string; parent_id: string | null; label_fr: string; kind: string };
  const cats = (catRows ?? []) as Cat[];
  const leaves = cats.filter((c) => c.parent_id != null);

  const kind = sp.kind === "part" || sp.kind === "vehicle" ? sp.kind : null;
  const visibleCats = kind ? leaves.filter((c) => c.kind === kind) : leaves;

  // ── Fitment first: it narrows the set before anything else does ──────────
  let fitmentIds: string[] | null = null;
  if (sp.make) {
    let fq = admin
      .from("listing_fitments")
      .select("listing_id, make, model, year_from, year_to")
      .ilike("make", sp.make.trim());
    if (sp.model) fq = fq.ilike("model", `%${sp.model.trim()}%`);
    const { data: fits } = await fq.limit(500);

    const year = Number(sp.year);
    const matching = (fits ?? []).filter((f) => {
      if (!Number.isFinite(year) || year <= 0) return true;
      const from = (f.year_from as number | null) ?? 0;
      const to = (f.year_to as number | null) ?? 9999;
      return year >= from && year <= to;
    });
    fitmentIds = [...new Set(matching.map((f) => f.listing_id as string))];
  }

  let query = admin
    .from("listings")
    .select(
      `id, title, price, price_on_request, negotiable, governorate, condition,
       published_at, seller_id,
       category:categories (label_fr, kind),
       photos:listing_photos (storage_path, sort_order)`,
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(60);

  if (sp.cat) query = query.eq("category_id", sp.cat);
  else if (kind) query = query.in("category_id", visibleCats.map((c) => c.id));
  if (sp.gov) query = query.eq("governorate", sp.gov);
  if (sp.q) query = query.ilike("search_text", `%${sp.q.trim().toLowerCase()}%`);
  if (sp.max && Number(sp.max) > 0) query = query.lte("price", Number(sp.max));
  if (fitmentIds) {
    // No fitment matched → no results, without a pointless second query.
    if (fitmentIds.length === 0) query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    else query = query.in("id", fitmentIds);
  }

  const { data } = await query;
  const rows = (data ?? []) as ListingRow[];

  // Badges in one round-trip rather than one per card.
  const sellerIds = [...new Set(rows.map((r) => r.seller_id))];
  const badged = new Set<string>();
  if (sellerIds.length > 0) {
    const { data: badges } = await admin
      .from("seller_badges")
      .select("seller_id, expires_at, revoked_at")
      .in("seller_id", sellerIds)
      .is("revoked_at", null);
    const now = Date.now();
    for (const b of badges ?? []) {
      if (new Date(b.expires_at as string).getTime() > now) badged.add(b.seller_id as string);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 lg:py-10">
      <header>
        <h1 className="text-[26px] font-extrabold tracking-tight">Annonces</h1>
        <p className="mt-1 text-[13px] text-muted">
          Voitures et pièces de rechange. Vous contactez le vendeur directement.
        </p>
      </header>

      <div className="mt-5">
        <AnnonceFilters
          categories={visibleCats.map((c) => ({ id: c.id, label: c.label_fr, kind: c.kind }))}
          governorates={[...GOVERNORATES]}
          current={{
            kind: kind ?? "",
            cat: sp.cat ?? "",
            gov: sp.gov ?? "",
            q: sp.q ?? "",
            make: sp.make ?? "",
            model: sp.model ?? "",
            year: sp.year ?? "",
            max: sp.max ?? "",
          }}
        />
      </div>

      <p className="mt-4 text-[12.5px] text-muted">
        {rows.length === 0
          ? "Aucune annonce ne correspond."
          : `${rows.length} annonce${rows.length > 1 ? "s" : ""}`}
        {sp.make && (
          <span>
            {" "}· compatibles {sp.make}
            {sp.model ? ` ${sp.model}` : ""}
            {sp.year ? ` ${sp.year}` : ""}
          </span>
        )}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map((l) => {
          const cat = one(l.category);
          const cover = (l.photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)[0];
          return (
            <Link
              key={l.id}
              href={`/annonces/${l.id}` as never}
              className="group overflow-hidden rounded-2xl border border-border bg-surface transition hover:border-gold-soft"
            >
              <div className="relative aspect-[4/3] bg-surface-2">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={propertyPhotoUrl(cover.storage_path)}
                    alt={l.title}
                    loading="lazy"
                    className="size-full object-cover transition group-hover:scale-[1.02]"
                  />
                ) : (
                  <span className="grid size-full place-items-center text-muted">
                    <ImageOff className="size-6" />
                  </span>
                )}
                {badged.has(l.seller_id) && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-white backdrop-blur-sm">
                    <BadgeCheck className="size-3 text-gold" /> vérifié
                  </span>
                )}
              </div>

              <div className="p-3">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  {cat?.kind === "part" ? <Wrench className="size-3" /> : <Car className="size-3" />}
                  {cat?.label_fr ?? ""}
                </span>
                <h2 className="mt-1 line-clamp-2 text-[13.5px] font-bold leading-snug text-foreground">
                  {l.title}
                </h2>
                <p className="batta-tabular mt-1 text-[14px] font-extrabold text-foreground">
                  {l.price_on_request || l.price == null
                    ? "Sur demande"
                    : `${formatTND(Number(l.price), locale)} TND`}
                </p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted">
                  <MapPin className="size-3" /> {l.governorate}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

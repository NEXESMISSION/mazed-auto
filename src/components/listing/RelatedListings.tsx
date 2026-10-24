import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { TrendingRail } from "@/components/landing/TrendingRail";
import { ListingCard, LISTING_CARD_SELECT, type CardListing } from "@/components/listing/ListingCard";
import { ArrowRight } from "lucide-react";

/**
 * "Annonces similaires" — the bottom of a listing page.
 *
 * A buyer who reaches the end of an annonce has either decided to call or
 * decided not to. Until now the second case was a dead end: the only way on
 * was the browser's back button. This is the other half of the page — the next
 * thing worth looking at.
 *
 * WHAT COUNTS AS SIMILAR. Not "same category", which on a site whose largest
 * category is "Voitures" means "anything at all". The candidates are scored:
 *
 *   same make/brand   +100   a Golf shopper is shopping for Golfs
 *   price proximity   0-60   someone reading a 45 000 TND listing is not
 *                            shopping at 200 000, and a rail full of cars they
 *                            cannot afford is worse than no rail
 *   same governorate   +35   you have to go and see it
 *   recency                  the tie-break, so identical scores are not frozen
 *                            in whatever order Postgres returns
 *
 * The pool is the same category; if that is too thin to fill a rail it widens
 * to the same kind (vehicle or part). If there is still nothing, the component
 * renders nothing rather than an empty heading.
 */

type Row = CardListing;

const SELECT = LISTING_CARD_SELECT;

/**
 * Which of these sellers currently hold a verified badge.
 *
 * One query for the whole rail rather than one per card. Kept out of the
 * component body because it reads the clock, and a component body has to be
 * pure — `react-hooks/purity` is right to object even though a server
 * component renders once.
 */
async function badgedSellers(
  admin: NonNullable<ReturnType<typeof getServiceSupabase>>,
  sellerIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (sellerIds.length === 0) return out;
  const { data } = await admin
    .from("seller_badges")
    .select("seller_id, expires_at, revoked_at")
    .in("seller_id", sellerIds)
    .is("revoked_at", null);
  const now = Date.now();
  for (const b of data ?? []) {
    if (new Date(b.expires_at as string).getTime() > now) out.add(b.seller_id as string);
  }
  return out;
}

/** The seller's own word for what it is: a car's marque, a part's brand. */
function makeOf(attrs: Record<string, unknown> | null, isPart: boolean): string {
  const v = (attrs ?? {})[isPart ? "brand" : "make"];
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

export async function RelatedListings({
  listingId,
  categoryId,
  categoryKind,
  governorate,
  price,
  attributes,
  locale,
  limit = 8,
}: {
  listingId: string;
  categoryId: string | null;
  categoryKind: string | null;
  governorate: string;
  price: number | null;
  attributes: Record<string, unknown> | null;
  locale: string;
  limit?: number;
}) {
  const admin = getServiceSupabase();
  if (!admin || !categoryId) return null;

  const isPart = categoryKind === "part";
  const thisMake = makeOf(attributes, isPart);

  // Same category first. 48 is enough to rank from without reading the table.
  let { data } = await admin
    .from("listings")
    .select(SELECT)
    .eq("status", "published")
    .eq("category_id", categoryId)
    .neq("id", listingId)
    .order("published_at", { ascending: false })
    .limit(48);

  let pool = (data ?? []) as unknown as Row[];

  // Too thin to be worth a rail — widen to every category of the same kind.
  if (pool.length < 4 && categoryKind) {
    const { data: cats } = await admin
      .from("categories")
      .select("id")
      .eq("kind", categoryKind)
      .not("parent_id", "is", null);
    const ids = (cats ?? []).map((c) => c.id as string);
    if (ids.length > 0) {
      ({ data } = await admin
        .from("listings")
        .select(SELECT)
        .eq("status", "published")
        .in("category_id", ids)
        .neq("id", listingId)
        .order("published_at", { ascending: false })
        .limit(48));
      pool = (data ?? []) as unknown as Row[];
    }
  }

  if (pool.length === 0) return null;

  const scored = pool
    .map((r) => {
      let score = 0;
      if (thisMake && makeOf(r.attributes, isPart) === thisMake) score += 100;
      if (r.governorate === governorate) score += 35;
      if (price != null && r.price != null && price > 0 && r.price > 0) {
        // 1 at an identical price, 0.5 at double or half, 0 far away.
        score += 60 * Math.max(0, 1 - Math.abs(r.price - price) / Math.max(r.price, price));
      }
      return { row: r, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.row.published_at ?? "").localeCompare(a.row.published_at ?? ""),
    )
    .slice(0, limit)
    .map((x) => x.row);

  const badged = await badgedSellers(admin, [...new Set(scored.map((r) => r.seller_id))]);
  const t = await getTranslations("listing.related");

  return (
    <section className="mt-10 border-t border-border pt-7">
      <div className="flex items-end justify-between gap-3 px-4 lg:px-6">
        <div>
          <span className="batta-eyebrow">{t("eyebrow")}</span>
          <h2 className="mt-1 text-[19px] font-extrabold tracking-tight text-foreground lg:text-[22px]">
            {t("title")}
          </h2>
        </div>
        <Link
          href={`/annonces?cat=${categoryId}` as never}
          className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-bold text-gold hover:underline"
        >
          {t("seeAll")} <ArrowRight className="size-3.5 rtl:-scale-x-100" />
        </Link>
      </div>

      {/* A phone scrolls sideways through them; a desktop has the room to lay
          them out and should use it. */}
      <div className="mt-3 lg:hidden">
        <TrendingRail>
          {scored.map((r) => (
            <div key={r.id} className="w-[210px] shrink-0 snap-start">
              <ListingCard listing={r} badged={badged.has(r.seller_id)} locale={locale} />
            </div>
          ))}
          <div className="w-1 shrink-0" />
        </TrendingRail>
      </div>

      <div className="mt-3 hidden gap-5 px-6 lg:grid lg:grid-cols-4">
        {scored.map((r) => (
          <ListingCard key={r.id} listing={r} badged={badged.has(r.seller_id)} locale={locale} />
        ))}
      </div>
    </section>
  );
}


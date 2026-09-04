import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { propertyPhotoUrl } from "@/lib/imageUrl";
import { avatarUrl } from "@/lib/avatar";
import { formatTND } from "@/lib/utils";
import { HeroCarousel } from "@/components/auction/HeroCarousel";
import { ContactReveal } from "./ContactReveal";
import { FavoriteButton } from "@/components/property/FavoriteButton";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  DiagnosticSheet,
  DiagnosticBadge,
  fetchPublishedDiagnostic,
} from "@/components/property/DiagnosticSheet";
import { BadgeCheck, MapPin, Wrench, Car, Clock, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/**
 * One annonce.
 *
 * Note what is NOT on this page: the seller's phone number. It is fetched by
 * ContactReveal on a click, because `contact_phone` is readable only by the
 * server (0154). That single decision is what keeps the catalog from being
 * harvested the day it goes public.
 */

type Row = {
  id: string; title: string; description: string | null;
  price: number | null; price_on_request: boolean; negotiable: boolean;
  condition: string | null; governorate: string; delegation: string | null;
  attributes: Record<string, unknown> | null;
  contact_name: string | null; show_phone: boolean;
  status: string; published_at: string | null; expires_at: string | null;
  view_count: number; contact_reveal_count: number;
  seller_id: string;
  category: { id: string; label_fr: string; kind: string } | { id: string; label_fr: string; kind: string }[] | null;
  photos: { storage_path: string; sort_order: number }[] | null;
  fitments: { make: string; model: string | null; year_from: number | null; year_to: number | null }[] | null;
};

const SELECT = `
  id, title, description, price, price_on_request, negotiable, condition,
  governorate, delegation, attributes, contact_name, show_phone, status,
  published_at, expires_at, view_count, contact_reveal_count, seller_id,
  category:categories (id, label_fr, kind),
  photos:listing_photos (storage_path, sort_order),
  fitments:listing_fitments (make, model, year_from, year_to)
`;

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

const CONDITION_LABEL: Record<string, string> = {
  new: "Neuf",
  used: "Occasion",
  refurbished: "Reconditionné",
};

async function fetchListing(id: string): Promise<Row | null> {
  const admin = getServiceSupabase();
  if (!admin) return null;
  const { data } = await admin.from("listings").select(SELECT).eq("id", id).maybeSingle();
  return (data as Row | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const l = await fetchListing(id);
  if (!l || l.status !== "published") return { title: "Annonce" };
  const price = l.price != null ? `${Number(l.price).toLocaleString("fr-FR")} TND` : "Prix sur demande";
  return {
    title: `${l.title} · ${price} · Mazed`,
    description: l.description?.slice(0, 160) ?? `${l.title} à ${l.governorate}.`,
  };
}

export default async function AnnoncePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const l = await fetchListing(id);

  if (!l || l.status !== "published") notFound();

  const category = one(l.category);
  const isPart = category?.kind === "part";
  const photos = (l.photos ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ id: p.storage_path, storage_path: p.storage_path, sort_order: p.sort_order }));

  const admin = getServiceSupabase();
  // Our own inspection of THIS annonce, if we published one. Fetched here (not
  // inside the component) so the badge in the header and the sheet lower down
  // come from a single read and can never disagree.
  const diagnostic = await fetchPublishedDiagnostic(l.id, "listing");

  const userClient = await getServerSupabase();
  const { data: { user } } = await userClient.auth.getUser();
  let saved = false;
  if (user) {
    const { data: w } = await userClient
      .from("watchlist")
      .select("id")
      .eq("user_id", user.id)
      .eq("listing_id", l.id)
      .maybeSingle();
    saved = !!w;
  }
  const [{ data: badge }, { data: attrDefs }] = await Promise.all([
    admin
      ? admin.rpc("has_verified_badge", { p_seller: l.seller_id })
      : Promise.resolve({ data: false }),
    admin && category
      ? admin
          .from("category_attributes")
          .select("field_key, label, unit, options, sort_order")
          .eq("category_id", category.id)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);

  // The seller's face, shown next to their name on the contact card. A
  // classified is a stranger asking a stranger to meet about a car; a photo is
  // the cheapest trust signal there is.
  const { data: sellerProfile } = admin && l.seller_id
    ? await admin.from("profiles").select("avatar_path").eq("id", l.seller_id).maybeSingle()
    : { data: null };

  // Only show attributes the seller actually filled, labelled the way the
  // category defines them — a raw jsonb dump ("transmission: manual") is not
  // something a buyer should have to decode.
  const attrs = (l.attributes ?? {}) as Record<string, unknown>;
  const specs = ((attrDefs ?? []) as {
    field_key: string; label: string; unit: string | null;
    options: { value: string; label: string }[] | null;
  }[])
    .map((d) => {
      const raw = attrs[d.field_key];
      if (raw == null || raw === "" || raw === false) return null;
      const value =
        raw === true
          ? "Oui"
          : d.options?.find((o) => o.value === String(raw))?.label ??
            (d.unit ? `${raw} ${d.unit}` : String(raw));
      return { label: d.label, value };
    })
    .filter(Boolean) as { label: string; value: string }[];

  // Structured data: a plain Offer. The v2 pages emit an auction-shaped
  // Product with bidding fields — wrong here, and the reason this is written
  // fresh rather than reused. The seller's phone is deliberately NOT included:
  // JSON-LD is the easiest thing on a page to scrape.
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mazed-auto.vercel.app")
  ).replace(/\/$/, "");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: l.title,
    description: l.description ?? undefined,
    image: photos.slice(0, 6).map((p) => propertyPhotoUrl(p.storage_path)),
    category: category?.label_fr,
    itemCondition:
      l.condition === "new"
        ? "https://schema.org/NewCondition"
        : l.condition === "refurbished"
          ? "https://schema.org/RefurbishedCondition"
          : "https://schema.org/UsedCondition",
    offers: {
      "@type": "Offer",
      url: `${siteUrl}/${locale}/annonces/${l.id}`,
      priceCurrency: "TND",
      ...(l.price != null && !l.price_on_request ? { price: Number(l.price) } : {}),
      availability: "https://schema.org/InStock",
      areaServed: l.governorate,
      ...(l.expires_at ? { priceValidUntil: l.expires_at.slice(0, 10) } : {}),
    },
  };

  return (
    <main className="mx-auto max-w-3xl pb-16">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {photos.length > 0 && (
        <div className="overflow-hidden lg:mt-6 lg:rounded-2xl lg:border lg:border-border">
          <HeroCarousel photos={photos} alt={l.title} />
        </div>
      )}

      <div className="px-4 lg:px-0">
        {/* ── Heading ── */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-muted ring-1 ring-border">
            {isPart ? <Wrench className="size-3" /> : <Car className="size-3" />}
            {category?.label_fr ?? "Annonce"}
          </span>
          {l.condition && (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-muted ring-1 ring-border">
              {CONDITION_LABEL[l.condition] ?? l.condition}
            </span>
          )}
          {badge === true && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gold-faint px-2.5 py-1 text-[11px] font-extrabold text-gold ring-1 ring-gold-soft">
              <BadgeCheck className="size-3.5" strokeWidth={2.4} /> Vendeur vérifié
            </span>
          )}
          {/* Two different claims, deliberately distinct: the badge above is
              about the SELLER, this one is about THIS vehicle. */}
          <DiagnosticBadge diagnostic={diagnostic} />
        </div>

        <h1 className="mt-2 text-[24px] font-extrabold leading-tight tracking-tight">{l.title}</h1>

        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" /> {l.governorate}
            {l.delegation ? ` · ${l.delegation}` : ""}
          </span>
          {l.published_at && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              publiée le {new Date(l.published_at).toLocaleDateString("fr-FR")}
            </span>
          )}
        </div>

        <div className="batta-tabular gradient-gold-text mt-3 text-[34px] font-extrabold leading-none">
          {l.price_on_request || l.price == null
            ? "Prix sur demande"
            : `${formatTND(Number(l.price), locale)} `}
          {!l.price_on_request && l.price != null && (
            <span className="text-[13px] font-bold uppercase tracking-[0.16em] text-gold/80">TND</span>
          )}
        </div>
        {l.negotiable && !l.price_on_request && (
          <p className="mt-1 text-[12px] text-muted">Prix négociable</p>
        )}

        {/* ── Contact ── */}
        {/* Who you are calling, and the button that calls them.

            The card used to spend a whole row on the heart alone, which left a
            band of empty space across the top; the seller's name was printed
            twice, once under the avatar and again under the button; and the
            panel was gold-tinted with a gold border around a gold button, so
            the one thing meant to stand out had nothing to stand out from.
            Neutral surface, one row for the identity with the heart at its
            end, and the gold spent only on the action. */}
        <section className="mt-5 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="size-11 shrink-0 overflow-hidden rounded-full bg-surface-2 ring-1 ring-border">
              {avatarUrl(sellerProfile?.avatar_path as string | null) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={avatarUrl(sellerProfile?.avatar_path as string | null) as string}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <span className="grid size-full place-items-center text-[15px] font-extrabold text-muted">
                  {(l.contact_name ?? "?").trim().charAt(0).toUpperCase() || "?"}
                </span>
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
                Vendeur
              </div>
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[14.5px] font-bold text-foreground">
                  {l.contact_name ?? "Particulier"}
                </span>
                {/* A tick, not a second "Vendeur vérifié" chip — that claim is
                    already made at the top of the page. Here it answers the
                    question being asked at this exact moment: do I call? */}
                {badge === true && (
                  <BadgeCheck
                    className="size-4 shrink-0 text-gold"
                    strokeWidth={2.4}
                    aria-label="Vendeur vérifié"
                  />
                )}
              </div>
            </div>

            <FavoriteButton listingId={l.id} initialSaved={saved} loggedIn={user !== null} />
          </div>

          <div className="mt-4">
            <ContactReveal listingId={l.id} revealCount={l.contact_reveal_count} />
          </div>
        </section>

        {/* ── Specs ── */}
        {specs.length > 0 && (
          <section className="mt-6">
            <h2 className="batta-eyebrow">Caractéristiques</h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {specs.map((s) => (
                <div key={s.label} className="rounded-xl bg-surface-2 p-3 ring-1 ring-border">
                  <dt className="text-[10.5px] uppercase tracking-[0.1em] text-muted">{s.label}</dt>
                  <dd className="mt-0.5 text-[13.5px] font-bold text-foreground">{s.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* ── Fitments: the reason a part is findable ── */}
        {isPart && (l.fitments ?? []).length > 0 && (
          <section className="mt-6">
            <h2 className="batta-eyebrow">Compatible avec</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {(l.fitments ?? []).map((f, i) => (
                <li
                  key={i}
                  className="rounded-full bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-foreground ring-1 ring-border"
                >
                  {f.make}
                  {f.model ? ` ${f.model}` : ""}
                  {f.year_from || f.year_to
                    ? ` · ${f.year_from ?? "…"}–${f.year_to ?? "…"}`
                    : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        {l.description && (
          <section className="mt-6">
            <h2 className="batta-eyebrow">Description</h2>
            <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-foreground/85">
              {l.description}
            </p>
          </section>
        )}

        {/* Our own inspection — renders nothing when we haven't done one. */}
        <div className="mt-6">
          <DiagnosticSheet listingId={l.id} diagnostic={diagnostic} />
        </div>

        {/* ── The honest disclaimer ── */}
        <section className="mt-8 flex items-start gap-2.5 rounded-2xl bg-surface-2 p-4 ring-1 ring-border">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted" />
          <p className="text-[11.5px] leading-relaxed text-muted">
            Mazed publie et vérifie les annonces, mais n&apos;intervient pas dans la
            transaction : le paiement et la remise se font directement entre vous et le
            vendeur. Ne versez jamais d&apos;acompte avant d&apos;avoir vu le véhicule ou la
            pièce et ses papiers.
          </p>
        </section>

        <div className="mt-6">
          <Link
            href={"/annonces" as never}
            className="text-[13px] font-bold text-gold hover:underline"
          >
            ← Toutes les annonces
          </Link>
        </div>
      </div>
    </main>
  );
}

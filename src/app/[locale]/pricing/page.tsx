import type { Metadata } from "next";
import { Check, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { PRODUCT_SELECT, toProduct, type Product } from "@/lib/products";

export const metadata: Metadata = {
  title: "Tarifs — Mazed Auto",
  description:
    "Ce que coûte une annonce sur Mazed Auto : un prix par publication, pas d'abonnement.",
};

// Prices come from the database, so this cannot be prerendered at build.
export const dynamic = "force-dynamic";

/**
 * Tarifs — one number per publication, and that is the whole model.
 *
 * The monthly Silver / Gold / Diamond plans that used to live here were
 * invented copy: no subscriptions backend existed, every CTA went to /contact,
 * and the quotas and percentages on the cards were placeholders. A price list
 * nobody can buy from is worse than no price list — it sets an expectation the
 * product cannot meet.
 *
 * What is real is `products` (0157): the admin sets the publication price per
 * category on /admin/pricing, parts are free (0167), and the submit route
 * charges exactly what this page shows. So this page reads the same rows the
 * checkout does, instead of restating them in JSX that drifts.
 */
export default async function PricingPage() {
  const admin = getServiceSupabase();
  let products: Product[] = [];
  if (admin) {
    const { data } = await admin
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .order("sort_order");
    products = (data ?? []).map((r) => toProduct(r as Parameters<typeof toProduct>[0]));
  }

  const standard = products.find((p) => p.slug === "annonce-standard") ?? null;
  const part = products.find((p) => p.slug === "annonce-piece") ?? null;
  const renewal = products.find((p) => p.kind === "renewal") ?? null;
  const promos = products.filter((p) => p.kind === "promo");

  const price = (p: Product | null) =>
    p == null ? "—" : p.price <= 0 ? "Gratuit" : `${p.price} TND`;

  return (
    <div className="mx-auto max-w-[var(--max-w)] px-4 pb-16 pt-6 lg:max-w-3xl lg:px-8 lg:pb-24 lg:pt-12">
      <header className="text-center">
        <h1 className="text-3xl font-black leading-tight tracking-tight lg:text-5xl">
          Vous payez à l&apos;annonce
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-muted lg:text-base">
          Pas d&apos;abonnement, pas d&apos;engagement. Une annonce, un prix — réglé
          après vérification, par virement ou D17.
        </p>
      </header>

      {/* The two prices that matter */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:mt-12">
        <PriceCard
          title="Voiture, moto, utilitaire"
          price={price(standard)}
          note="Par annonce, en ligne 30 jours après validation."
          highlight
        />
        <PriceCard
          title="Pièce de rechange"
          price={price(part)}
          note="Publier une pièce ne coûte rien, dans toutes les sous-catégories."
        />
      </div>

      {/* Options, only if the admin actually sells them */}
      {(renewal || promos.length > 0) && (
        <section className="mt-10">
          <h2 className="batta-eyebrow flex items-center gap-2">
            <span aria-hidden className="batta-gold-rule-short" />
            En option
          </h2>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {renewal && <OptionRow name="Renouveler une annonce expirée" price={price(renewal)} />}
            {promos.map((p) => (
              <OptionRow key={p.slug} name={p.nameFr} price={price(p)} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 rounded-2xl border border-border bg-surface p-5 lg:p-6">
        <h2 className="text-[15px] font-extrabold">Ce qui est compris</h2>
        <ul className="mt-3 space-y-2">
          {[
            "Jusqu'à 12 photos par annonce",
            "Vos coordonnées visibles par les acheteurs vérifiés",
            "Vérification de chaque annonce avant sa mise en ligne",
            "Modification et retrait à tout moment",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2 text-[13px] text-foreground/85">
              <Check className="mt-0.5 size-4 shrink-0 text-gold" strokeWidth={2.4} />
              {line}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 text-center">
        <Link
          href="/annonces/nouvelle"
          className="batta-btn-luxe tap-target inline-flex h-12 items-center gap-2 px-6 text-[14px]"
        >
          Publier une annonce <ArrowRight className="size-4" />
        </Link>
        <p className="mt-3 text-[12px] text-muted">
          Une question sur la facturation ?{" "}
          <Link href="/contact" className="font-semibold text-gold hover:underline">
            Contactez-nous
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function PriceCard({
  title,
  price,
  note,
  highlight,
}: {
  title: string;
  price: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        highlight ? "border-gold/40 bg-[var(--gold-faint)]" : "border-border bg-surface"
      }`}
    >
      <div className="text-[12.5px] font-bold text-muted">{title}</div>
      <div className="batta-tabular gradient-gold-text mt-2 text-[38px] font-extrabold leading-none">
        {price}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">{note}</p>
    </div>
  );
}

function OptionRow({ name, price }: { name: string; price: string }) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-[13px] text-foreground/85">{name}</span>
      <span className="batta-tabular shrink-0 text-[13px] font-extrabold text-foreground">
        {price}
      </span>
    </li>
  );
}

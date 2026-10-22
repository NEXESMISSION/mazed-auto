import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { shopsGate } from "@/lib/shops/public";
import { getProContext } from "@/lib/shops/proContext";
import { plansForSale } from "@/lib/shops/plans";
import { ShopsPreviewBanner } from "../boutiques/ShopsPreviewBanner";
import { BadgeCheck, Car, KeyRound, Wrench, Check, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Boutiques professionnelles — Mazed Auto",
  description:
    "Concessionnaires, loueurs et vendeurs de pièces : votre boutique sur Mazed Auto, vos annonces dans le catalogue, vos clients vous appellent directement.",
};

export const dynamic = "force-dynamic";

/**
 * /fr/pro — what a professional gets, and what it costs.
 *
 * The plans are read from `products`, active rows only: an offer an admin has
 * not switched on is not shown (D-P6 — prices are confirmed for sale only once
 * invoicing is settled). With none on sale yet the page says so and offers
 * contact instead of a dead button.
 */
export default async function ProLandingPage() {
  const admin = getServiceSupabase();
  if (!admin) notFound();
  const gate = await shopsGate(admin);
  if (!gate.visible) notFound();

  const [plans, ctx] = await Promise.all([plansForSale(admin), getProContext()]);
  const hasShop = ctx.kind === "shop";

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6 lg:px-8 lg:pt-10">
      {gate.preview && <ShopsPreviewBanner />}

      <header className="text-center">
        <span className="batta-eyebrow">Professionnels</span>
        <h1 className="mt-1 text-[28px] font-black leading-tight tracking-tight lg:text-[42px]">
          Votre boutique sur Mazed Auto
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-[13.5px] leading-relaxed text-muted lg:text-base">
          Une page à votre nom, toutes vos annonces dans le catalogue, et vos clients qui vous
          appellent directement. Mazed ne prend aucune commission sur vos ventes ni vos locations.
        </p>
        <Link
          href={(hasShop ? "/pro/dashboard" : "/pro/creer") as never}
          className="batta-btn-luxe tap-target mt-5 inline-flex h-12 items-center gap-2 px-6 text-[14px]"
        >
          {hasShop ? "Mon espace pro" : "Ouvrir ma boutique"} <ArrowRight className="size-4" />
        </Link>
      </header>

      <section className="mt-10 grid gap-3 sm:grid-cols-3">
        {[
          { Icon: Car, title: "Vente de véhicules", body: "Concessionnaires et revendeurs : voitures, utilitaires, motos." },
          { Icon: KeyRound, title: "Location", body: "Prix par jour, conditions et disponibilité, sans calendrier à tenir." },
          { Icon: Wrench, title: "Pièces auto", body: "Votre stock en ligne, avec la compatibilité marque / modèle / année." },
        ].map(({ Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-border bg-surface p-4">
            <Icon className="size-5 text-gold" />
            <h2 className="mt-2 text-[14.5px] font-extrabold">{title}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="text-center text-[20px] font-extrabold tracking-tight">Les formules</h2>
        {plans.length === 0 ? (
          <p className="mx-auto mt-3 max-w-xl rounded-2xl border border-border bg-surface p-5 text-center text-[13px] text-muted">
            Les formules seront en vente très bientôt.{" "}
            <Link href={"/contact" as never} className="font-bold text-gold hover:underline">Contactez-nous</Link>{" "}
            pour ouvrir votre boutique dès maintenant.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <div key={p.code} className="flex flex-col rounded-2xl border border-border bg-surface p-5">
                <h3 className="text-[16px] font-extrabold">{p.name}</h3>
                <p className="batta-tabular mt-2 text-[30px] font-black">
                  {p.price.toLocaleString("fr-FR")} <span className="text-[14px] font-bold text-muted">TND / {p.durationDays} j</span>
                </p>
                <ul className="mt-3 space-y-1.5 text-[12.5px] text-foreground/85">
                  <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-gold" /> {p.limits.vehicles} véhicules en ligne (vente ou location)</li>
                  <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-gold" /> ou {p.limits.parts.toLocaleString("fr-FR")} pièces en ligne</li>
                  <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-gold" /> Brouillons illimités</li>
                </ul>
              </div>
            ))}
          </div>
        )}
        <ul className="mx-auto mt-5 max-w-2xl space-y-1.5 text-[12px] leading-relaxed text-muted">
          <li>• Le nombre d&apos;annonces s&apos;entend pour votre activité : véhicules pour la vente et la location, pièces pour les pièces.</li>
          <li>• Les brouillons et les annonces retirées ne comptent pas.</li>
          <li>• Renouvellement à votre initiative : aucun prélèvement automatique.</li>
          <li>• À la fin d&apos;un abonnement, vos annonces sont mises en pause, jamais supprimées.</li>
        </ul>
      </section>

      <section className="mt-10 flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-gold" />
        <p className="text-[13px] leading-relaxed text-muted">
          <strong className="text-foreground">Le badge « Boutique vérifiée » ne s&apos;achète pas.</strong> Il est
          accordé par notre équipe après contrôle de vos justificatifs (RNE, patente), que vous déposez
          depuis votre espace pro. Les particuliers, eux, publient gratuitement une voiture et cinq pièces.
        </p>
      </section>
    </main>
  );
}

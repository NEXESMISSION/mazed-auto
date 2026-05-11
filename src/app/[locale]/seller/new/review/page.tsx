"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { Check, Edit2, Send, AlertTriangle } from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { LegalLink } from "@/components/legal/LegalLink";
import { useAuth } from "@/lib/auth";
import { useDraft, clearDraft } from "@/lib/draft";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, formatNumber } from "@/lib/format";
import { isInBlackout, type BlackoutWindow } from "@/lib/blackout";
import { pickDepositFromTiers, type DepositTier } from "@/lib/deposit";

const fuelLabels: Record<string, string> = {
  gasoline: "Essence",
  diesel: "Diesel",
  hybrid: "Hybride",
  electric: "Électrique",
};

const conditionLabels: Record<string, string> = {
  new: "Neuf",
  excellent: "Excellent",
  good: "Bon",
  fair: "Acceptable",
  damaged: "Endommagé",
};

// (Dev placeholder photos removed — every auction must use real photos
// captured live in step-2 / step-3.)

export default function ReviewPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const { draft, hydrated } = useDraft();
  const [agreed, setAgreed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const photoCount =
    draft.imageUrls?.filter((u) => u && u.length > 0).length ?? 0;

  async function publish() {
    if (!user) {
      toast("Connectez-vous d'abord", "warning");
      router.push("/login");
      return;
    }
    if (user.kycStatus !== "verified") {
      toast("Vous devez vérifier votre identité (KYC) avant de publier une enchère", "warning");
      router.push("/kyc/start");
      return;
    }
    setPublishing(true);
    setConfirmOpen(false);

    const supabase = createClient();

    // 1) Ensure a `sellers` row exists for this auth user
    const username =
      (user.email?.split("@")[0] || `seller_${user.id.slice(0, 6)}`).toLowerCase();
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || username;

    const { error: sellerErr } = await supabase
      .from("sellers")
      .upsert(
        {
          id: user.id,
          username,
          display_name: displayName,
          city: draft.city || "Tunis",
          trust_score: user.trustScore || 50,
          trust_level: "trusted",
          verified_kyc: user.kycStatus === "verified",
          verified_ownership: true,
          account_age_months: 1,
        },
        { onConflict: "id" },
      );

    if (sellerErr) {
      setPublishing(false);
      toast("Échec d'enregistrement du profil vendeur : " + sellerErr.message, "error");
      return;
    }

    // 2) Insert the auction row
    const startingPrice = draft.startingPrice ?? 0;

    const finalImages = (draft.imageUrls ?? []).filter(
      (u) => u && u.length > 0,
    );
    if (finalImages.length < 12) {
      setPublishing(false);
      toast(
        "Vous devez fournir 12 photos avant de publier l'enchère",
        "warning",
      );
      router.push("/seller/new/step-2");
      return;
    }
    if (!draft.videoUrl) {
      setPublishing(false);
      toast("Vous devez filmer la voiture avant de publier", "warning");
      router.push("/seller/new/step-3");
      return;
    }

    const durationMs = (draft.durationDays ?? 7) * 24 * 3600 * 1000;
    const now = new Date();
    const endTime = new Date(now.getTime() + durationMs);

    // Blackout window enforcement — admins can mark hours of the day
    // (typically late night) as off-limits for auction closings so the
    // last 5 minutes don't run while nobody's awake to defend a bid.
    try {
      const { data: rows } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", [
          "auction.blackout.enabled",
          "auction.blackout.windows",
          "auction.blackout.timezone",
        ]);
      const byKey = new Map(
        (rows ?? []).map((r) => [r.key, r.value as unknown]),
      );
      const enabled = byKey.get("auction.blackout.enabled") === true;
      if (enabled) {
        const windows = (byKey.get("auction.blackout.windows") ?? [[23, 7]]) as
          | BlackoutWindow[]
          | unknown;
        const timezone =
          (byKey.get("auction.blackout.timezone") as string | undefined) ??
          "Africa/Tunis";
        const safeWindows: BlackoutWindow[] = Array.isArray(windows)
          ? (windows as BlackoutWindow[]).filter(
              (w) =>
                Array.isArray(w) &&
                w.length === 2 &&
                w.every((n) => typeof n === "number"),
            )
          : [];
        if (isInBlackout(endTime, safeWindows, timezone)) {
          setPublishing(false);
          toast(
            "L'heure de fin tombe dans une plage interdite. Choisissez une autre durée.",
            "warning",
          );
          return;
        }
      }
    } catch {
      // If the settings table is missing on a fresh checkout, fall
      // through to insert without blackout enforcement.
    }

    // Bid-increment tiers live in platform_settings so the admin can
    // tune them without a redeploy. Falls back to the legacy 250/500/1000
    // ladder if the row is missing or malformed.
    let bidIncrement = 250;
    // Tiered fixed-amount entry deposit. Same admin-tunable pattern as
    // bid increments. Falls back to the spec defaults if the row is
    // missing on a fresh checkout.
    let participationDeposit = pickDepositFromTiers(startingPrice);
    try {
      const [{ data: incrRow }, { data: depRow }] = await Promise.all([
        supabase
          .from("platform_settings")
          .select("value")
          .eq("key", "listing.bid_increment_tiers")
          .maybeSingle(),
        supabase
          .from("platform_settings")
          .select("value")
          .eq("key", "auction.deposit.tiers")
          .maybeSingle(),
      ]);

      const incrTiers = (incrRow?.value ?? []) as Array<{
        max: number | null;
        increment: number;
      }>;
      if (Array.isArray(incrTiers) && incrTiers.length > 0) {
        const match = incrTiers.find(
          (t) => t.max === null || startingPrice < t.max,
        );
        if (match && Number.isFinite(match.increment)) {
          bidIncrement = match.increment;
        }
      } else {
        bidIncrement =
          startingPrice >= 100000
            ? 1000
            : startingPrice >= 30000
              ? 500
              : 250;
      }

      const depTiers = depRow?.value as unknown;
      if (Array.isArray(depTiers) && depTiers.length > 0) {
        participationDeposit = pickDepositFromTiers(
          startingPrice,
          depTiers as DepositTier[],
        );
      }
    } catch {
      bidIncrement =
        startingPrice >= 100000 ? 1000 : startingPrice >= 30000 ? 500 : 250;
      // participationDeposit stays at the default from pickDepositFromTiers above.
    }

    const { data: auction, error: auctionErr } = await supabase
      .from("auctions")
      .insert({
        seller_id: user.id,
        make: draft.make,
        model: draft.model,
        year: draft.year,
        mileage: draft.mileage ?? 0,
        fuel_type: draft.fuelType,
        transmission: draft.transmission,
        color: draft.color,
        condition: draft.condition,
        category: draft.category,
        description: draft.description ?? null,
        features: draft.features ?? [],
        city: draft.city,
        region: draft.region,
        image_urls: finalImages,
        video_url: draft.videoUrl,
        starting_price: startingPrice,
        reserve_price: draft.reservePrice ?? null,
        buy_now_price: draft.buyNowPrice ?? null,
        current_price: startingPrice,
        participation_deposit: participationDeposit,
        bid_increment: bidIncrement,
        start_time: now.toISOString(),
        end_time: endTime.toISOString(),
        original_end_time: endTime.toISOString(),
        // PLAN §22 — every new auction lands in the admin review queue.
        // An admin flips it to `active` from /admin/auctions-queue.
        status: "pending_review",
        reserve_met: false,
        // Golden-Lock metadata — captured here so /admin/ownership-review
        // can surface exceptional cases instead of letting them mix into
        // the regular queue with no signal.
        ownership_exception: draft.ownershipException ?? null,
        carte_grise_owner_name: draft.ownerName ?? null,
      })
      .select("id")
      .single();

    setPublishing(false);

    if (auctionErr) {
      toast("Échec de la publication de l'enchère : " + auctionErr.message, "error");
      return;
    }

    clearDraft();
    toast(
      "Votre enchère a été soumise à l'examen — vous serez notifié dès son acceptation",
      "success",
    );
    router.push(`/seller/auctions/${auction.id}`);
    router.refresh();
  }

  if (!hydrated) {
    return (
      <CreateAuctionShell current={4}>
        <div className="text-center py-12 text-[var(--foreground-muted)]">
          Chargement...
        </div>
      </CreateAuctionShell>
    );
  }

  // Validation
  const missing: string[] = [];
  if (!draft.make || !draft.model || !draft.year) missing.push("Données du véhicule");
  if (photoCount < 12) missing.push(`Photos (${photoCount}/12)`);
  if (!draft.videoUrl) missing.push("Vidéo");
  if (!draft.startingPrice) missing.push("Prix");

  return (
    <CreateAuctionShell current={4}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">Vérification finale</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Vérifiez chaque détail avant la publication
          </p>
        </div>

        {missing.length > 0 && (
          <div className="rounded-[var(--radius)] p-3 flex gap-2 items-start bg-red-500/10 border border-red-500/30">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
            <div className="text-xs leading-relaxed text-red-200">
              <div className="font-bold">Étapes manquantes :</div>
              <div className="mt-0.5">{missing.join(" — ")}</div>
            </div>
          </div>
        )}

        {user && user.kycStatus !== "verified" && (
          <div className="rounded-[var(--radius)] bg-amber-500/10 border border-amber-500/40 p-3 flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed flex-1">
              <div className="font-bold text-amber-300">
                Vous devez vérifier votre identité (KYC) avant la publication
              </div>
              <div className="text-[var(--foreground-muted)] mt-0.5">
                Nous vérifions votre carte d'identité pour garantir la fiabilité de chaque enchère.
              </div>
            </div>
            <Link href="/kyc/start">
              <Button size="sm">Commencer la vérification</Button>
            </Link>
          </div>
        )}

        <Section title="Données du véhicule" editHref="/seller/new/step-1">
          <Row
            k="Marque + modèle"
            v={
              draft.make && draft.model && draft.year
                ? `${draft.make} ${draft.model} ${draft.year}`
                : "—"
            }
          />
          <Row
            k="Kilométrage"
            v={
              draft.mileage !== undefined
                ? `${formatNumber(draft.mileage)} km`
                : "—"
            }
          />
          <Row k="Carburant" v={fuelLabels[draft.fuelType ?? ""] ?? "—"} />
          <Row k="Statut" v={conditionLabels[draft.condition ?? ""] ?? "—"} />
          <Row k="Site" v={draft.city ?? "—"} />
        </Section>

        <Section title="Photos" editHref="/seller/new/step-2">
          {photoCount === 12 ? (
            <div className="text-sm text-[var(--success)] flex items-center gap-2">
              <Check className="h-4 w-4" />
              12 photos téléversées
            </div>
          ) : (
            <div className="text-sm text-[var(--warning)]">
              {photoCount}/12 — Vous devez téléverser les 12 photos
            </div>
          )}
        </Section>

        <Section title="Vidéo" editHref="/seller/new/step-3">
          {draft.videoUrl ? (
            <div className="text-sm text-[var(--success)] flex items-center gap-2">
              <Check className="h-4 w-4" />
              Vidéo enregistrée
            </div>
          ) : (
            <div className="text-sm text-[var(--warning)]">Enregistrement vidéo requis</div>
          )}
        </Section>

        <Section title="Propriété" editHref="/seller/new/step-4">
          <Row k="Nom sur la carte" v={draft.ownerName ?? "—"} />
          <Row k="Numéro de plaque" v={draft.registration ?? "—"} />
          {draft.ownerName && (
            <div className="text-xs text-[var(--success)] mt-1">
              ✓ Verrou doré franchi
            </div>
          )}
        </Section>

        <Section title="Prix et durée" editHref="/seller/new/step-5">
          <Row
            k="Prix de départ"
            v={draft.startingPrice ? formatPrice(draft.startingPrice) : "—"}
          />
          {draft.reservePrice && (
            <Row k="Prix de réserve" v={formatPrice(draft.reservePrice)} />
          )}
          {draft.buyNowPrice && (
            <Row k="Achat immédiat" v={formatPrice(draft.buyNowPrice)} />
          )}
          <Row
            k="Durée"
            v={draft.durationDays ? `${draft.durationDays} jours` : "—"}
          />
        </Section>

        <div className="rounded-[var(--radius)] bg-amber-500/10 border border-amber-500/30 p-3 flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            Après la publication, les données ne peuvent plus être modifiées. Vous pouvez seulement annuler
            l'enchère (ce qui peut affecter votre réputation).
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <Checkbox
            className="mt-0.5"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            J&apos;accepte les{" "}
            <LegalLink kind="terms">conditions de publication</LegalLink>{" "}
            et je confirme que toutes les informations sont exactes. Toute information erronée peut entraîner
            la désactivation de mon compte.
          </span>
        </label>

        <Button
          size="xl"
          fullWidth
          disabled={
            !agreed ||
            publishing ||
            missing.length > 0 ||
            !user ||
            user.kycStatus !== "verified"
          }
          onClick={() => setConfirmOpen(true)}
        >
          <Send className="h-5 w-5" />
          {publishing
            ? "Envoi en cours..."
            : !user
              ? "Connectez-vous pour publier"
              : user.kycStatus !== "verified"
                ? "Terminez d'abord la vérification d'identité"
                : "Soumettre pour examen"}
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmer la soumission pour examen"
        description="Notre équipe examinera votre enchère sous 24 heures avant de la publier aux acheteurs"
      >
        <div className="space-y-4">
          <ul className="space-y-2 text-sm text-[var(--foreground-muted)]">
            <Bullet text="La voiture apparaîtra immédiatement sur toutes les pages d'enchères" />
            <Bullet text="Vous recevrez des notifications en temps réel pour chaque nouvelle offre" />
            <Bullet text="Commission Mazed de 7% uniquement à la vente finale" />
          </ul>
        </div>
        <ModalFooter>
          <Button variant="ghost" size="md" onClick={() => setConfirmOpen(false)}>
            Annuler
          </Button>
          <Button size="md" onClick={publish} disabled={publishing}>
            <Send className="h-4 w-4" />
            {publishing ? "Publication en cours..." : "Confirmer et publier"}
          </Button>
        </ModalFooter>
      </Modal>
    </CreateAuctionShell>
  );
}

function Section({
  title,
  editHref,
  children,
}: {
  title: string;
  editHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-sm font-bold">{title}</span>
        <Link
          href={editHref}
          className="text-xs text-[var(--gold)] hover:underline flex items-center gap-1"
        >
          <Edit2 className="h-3 w-3" />
          Modifier
        </Link>
      </div>
      <div className="p-4 space-y-1.5 text-sm">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--foreground-muted)] shrink-0">{k}</span>
      <span className="font-semibold text-end truncate">{v}</span>
    </div>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <li className="flex gap-2">
      <Check className="h-4 w-4 text-[var(--gold)] shrink-0 mt-0.5" />
      {text}
    </li>
  );
}

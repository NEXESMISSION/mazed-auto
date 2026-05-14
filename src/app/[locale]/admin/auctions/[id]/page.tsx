import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { getAuctionById, listRecentBids } from "@/lib/db";
import { auctionCode, formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";
import { AdminAuctionControls } from "./AdminAuctionControls";
import { AdminBidsList } from "./AdminBidsList";
import { getAuctionBlackoutConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminAuctionDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const auction = await getAuctionById(supabase, id);
  if (!auction) notFound();

  const [bids, editRequests, reports, statusLog, fullRow, blackout] =
    await Promise.all([
      listRecentBids(supabase, id, 100),
      supabase
        .from("auction_edit_requests")
        .select("id, fields, message, status, requested_at, resolved_at")
        .eq("auction_id", id)
        .order("requested_at", { ascending: false }),
      supabase
        .from("reports")
        .select(
          "id, reason, severity, status, detail, created_at, reporter_label",
        )
        .eq("auction_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("auction_status_log")
        .select("id, from_status, to_status, actor_id, detail, created_at")
        .eq("auction_id", id)
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("auctions")
        .select(
          "make, model, year, mileage, color, description, city, region, starting_price, reserve_price, buy_now_price, bid_increment, category, fuel_type, transmission, condition, start_time, end_time, image_urls, video_url, features, vin, registration, carte_grise_owner_name, carte_grise_front_url, carte_grise_back_url, ownership_exception, participation_deposit",
        )
        .eq("id", id)
        .maybeSingle(),
      getAuctionBlackoutConfig(),
    ]);

  // Prefer the raw row for the full media/spec render — getAuctionById's
  // hydrated Auction only carries imageUrls[0]-ish convenience fields in
  // some paths, and the carte grise columns aren't on the Auction type
  // at all (admin-only metadata).
  const row = fullRow.data;
  const allPhotos: string[] =
    (row?.image_urls as string[] | null)?.filter(Boolean) ??
    auction.vehicle.imageUrls ??
    [];
  const videoUrl = (row?.video_url as string | null) ?? auction.vehicle.videoUrl ?? null;
  const features: string[] = (row?.features as string[] | null) ?? auction.vehicle.features ?? [];

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl">
        <Link
          href="/admin/auctions-queue"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la file d&apos;attente
        </Link>

        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
          <div className="p-4 flex flex-col md:flex-row gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb(auction.vehicle.imageUrls[0], { width: 320, quality: 65 })}
              alt=""
              className="h-40 w-full md:w-56 rounded-[var(--radius-sm)] object-cover shrink-0"
            />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl md:text-2xl font-extrabold">
                  {auction.vehicle.make} {auction.vehicle.model}{" "}
                  {auction.vehicle.year}
                </h1>
                <span className="font-mono text-xs text-[var(--foreground-subtle)]">
                  {auctionCode(auction.id)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="default" size="sm">
                  {auction.status}
                </Badge>
                {auction.isFeatured && (
                  <Badge variant="goldFilled" size="sm">
                    Featured
                  </Badge>
                )}
                {auction.isVip && (
                  <Badge variant="gold" size="sm">
                    VIP
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--foreground-muted)] pt-1">
                <span>
                  Vendeur :{" "}
                  <Link
                    href={`/admin/users/${auction.seller.id}`}
                    className="text-foreground hover:underline"
                  >
                    {auction.seller.displayName}
                  </Link>
                </span>
                <span>
                  Prix actuel :{" "}
                  <span className="font-bold text-[var(--gold)]">
                    {formatPrice(auction.currentPrice)}
                  </span>
                </span>
                <span>
                  Réserve :{" "}
                  {auction.reservePrice ? formatPrice(auction.reservePrice) : "—"}
                </span>
                <span>Offres : {auction.totalBids}</span>
                <span>Fin : {auction.endTime.toLocaleString("fr-FR")}</span>
              </div>
              <div className="pt-1">
                <Link
                  href={`/auctions/${auction.id}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--gold)] hover:underline"
                >
                  Voir l&apos;enchère publique
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── Full photo set — admins moderate against ALL 12 photos,
            not just the hero. Lazy-loaded grid, click opens the raw
            file in a new tab for a pixel-level look. ── */}
        <Section title={`Photos (${allPhotos.length})`}>
          {allPhotos.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">
              Aucune photo.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {allPhotos.map((src, i) => (
                <a
                  key={`${src}-${i}`}
                  href={src}
                  target="_blank"
                  rel="noopener"
                  className="block aspect-[4/3] rounded-[var(--radius-sm)] overflow-hidden bg-black ring-1 ring-[var(--border)] hover:ring-[var(--gold)] transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumb(src, { width: 360, quality: 62 })}
                    alt={`Photo ${i + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </a>
              ))}
            </div>
          )}
        </Section>

        {/* ── Walkaround video — the 60s tour the seller filmed. ── */}
        {videoUrl && (
          <Section title="Vidéo de présentation">
            <video
              src={videoUrl}
              controls
              playsInline
              className="w-full max-h-[420px] rounded-[var(--radius-sm)] bg-black"
            />
          </Section>
        )}

        {/* ── Ownership / carte grise — the Golden-Lock verification
            material. Admins need the actual document images + the
            declared owner name + any exception reason to clear an
            auction. ── */}
        <Section title="Propriété — carte grise">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-[var(--foreground-muted)]">
                Nom sur la carte grise :{" "}
                <span className="text-foreground font-semibold">
                  {row?.carte_grise_owner_name || "—"}
                </span>
              </span>
              <span className="text-[var(--foreground-muted)]">
                VIN :{" "}
                <span className="text-foreground font-mono">
                  {row?.vin || "—"}
                </span>
              </span>
              <span className="text-[var(--foreground-muted)]">
                Immatriculation :{" "}
                <span className="text-foreground font-mono">
                  {row?.registration || "—"}
                </span>
              </span>
            </div>
            {row?.ownership_exception ? (
              <div className="rounded-[var(--radius)] bg-amber-500/10 border border-amber-500/30 p-3 text-sm">
                <span className="font-bold text-amber-300">
                  Exception de propriété :
                </span>{" "}
                {row.ownership_exception}
              </div>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <DocCard label="Carte grise — recto" url={row?.carte_grise_front_url ?? null} />
              <DocCard label="Carte grise — verso" url={row?.carte_grise_back_url ?? null} />
            </div>
          </div>
        </Section>

        {/* ── Vehicle spec sheet + feature checklist. ── */}
        <Section title="Fiche technique">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            <Spec k="Marque" v={auction.vehicle.make} />
            <Spec k="Modèle" v={auction.vehicle.model} />
            <Spec k="Année" v={String(auction.vehicle.year)} />
            <Spec
              k="Kilométrage"
              v={`${(row?.mileage ?? auction.vehicle.mileage).toLocaleString("fr-FR")} km`}
            />
            <Spec k="Carburant" v={row?.fuel_type ?? auction.vehicle.fuelType} />
            <Spec k="Boîte" v={row?.transmission ?? auction.vehicle.transmission} />
            <Spec k="Couleur" v={row?.color ?? auction.vehicle.color} />
            <Spec k="État" v={row?.condition ?? auction.vehicle.condition} />
            <Spec k="Catégorie" v={row?.category ?? auction.vehicle.category} />
            <Spec
              k="Ville"
              v={`${row?.city ?? auction.vehicle.city}, ${row?.region ?? auction.vehicle.region}`}
            />
            <Spec
              k="Caution"
              v={formatPrice(
                Number(row?.participation_deposit ?? auction.participationDeposit),
              )}
            />
            <Spec
              k="Achat immédiat"
              v={
                row?.buy_now_price
                  ? formatPrice(Number(row.buy_now_price))
                  : "—"
              }
            />
          </div>
          {(row?.description ?? auction.vehicle.description) && (
            <div className="mt-4">
              <div className="text-xs font-bold text-[var(--foreground-muted)] mb-1">
                Description
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {row?.description ?? auction.vehicle.description}
              </p>
            </div>
          )}
          {features.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-bold text-[var(--foreground-muted)] mb-1.5">
                Équipements ({features.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {features.map((f) => (
                  <span
                    key={f}
                    className="px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-xs"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        <AdminAuctionControls
          auctionId={auction.id}
          status={auction.status}
          isFeatured={auction.isFeatured}
          isVip={auction.isVip}
          totalBids={auction.totalBids}
          blackout={blackout}
          initialEditable={{
            make: fullRow.data?.make ?? auction.vehicle.make,
            model: fullRow.data?.model ?? auction.vehicle.model,
            year: fullRow.data?.year ?? auction.vehicle.year,
            mileage: fullRow.data?.mileage ?? auction.vehicle.mileage,
            color: fullRow.data?.color ?? auction.vehicle.color,
            description: fullRow.data?.description ?? null,
            city: fullRow.data?.city ?? auction.vehicle.city,
            region: fullRow.data?.region ?? auction.vehicle.region,
            starting_price: Number(
              fullRow.data?.starting_price ?? auction.startingPrice,
            ),
            reserve_price:
              fullRow.data?.reserve_price !== null &&
              fullRow.data?.reserve_price !== undefined
                ? Number(fullRow.data.reserve_price)
                : null,
            buy_now_price:
              fullRow.data?.buy_now_price !== null &&
              fullRow.data?.buy_now_price !== undefined
                ? Number(fullRow.data.buy_now_price)
                : null,
            bid_increment: Number(
              fullRow.data?.bid_increment ?? auction.bidIncrement,
            ),
            category: fullRow.data?.category ?? auction.vehicle.category,
            fuel_type: fullRow.data?.fuel_type ?? auction.vehicle.fuelType,
            transmission:
              fullRow.data?.transmission ?? auction.vehicle.transmission,
            condition: fullRow.data?.condition ?? auction.vehicle.condition,
            start_time:
              fullRow.data?.start_time ?? auction.startTime.toISOString(),
            end_time: fullRow.data?.end_time ?? auction.endTime.toISOString(),
          }}
        />

        {(statusLog.data ?? []).length > 0 && (
          <Section title={`Chronologie (${statusLog.data?.length})`}>
            <ol className="relative border-s-2 border-[var(--border)] ms-3 space-y-3">
              {statusLog.data?.map((s) => (
                <li key={s.id} className="ms-4">
                  <span className="absolute -start-[7px] mt-1 h-3 w-3 rounded-full bg-[var(--gold)]" />
                  <div className="text-xs text-[var(--foreground-muted)] tabular-nums">
                    {new Date(s.created_at).toLocaleString("fr-FR")}
                  </div>
                  <div className="text-sm">
                    {s.from_status ? (
                      <>
                        <code className="font-mono text-[11px] text-[var(--foreground-muted)]">
                          {s.from_status}
                        </code>
                        <span className="mx-1">→</span>
                      </>
                    ) : (
                      <span className="text-[var(--foreground-muted)]">créée · </span>
                    )}
                    <code className="font-mono text-[11px] font-bold text-[var(--gold)]">
                      {s.to_status}
                    </code>
                    {s.actor_id && (
                      <span className="text-[10px] text-[var(--foreground-subtle)] ms-2">
                        par {s.actor_id.slice(0, 8)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {(editRequests.data ?? []).length > 0 && (
          <Section title={`Demandes de modification (${editRequests.data?.length})`}>
            <div className="space-y-2">
              {editRequests.data?.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-[var(--radius)] border p-3 text-sm ${
                    r.status === "open"
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-[var(--surface-2)] border-[var(--border)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge size="sm" variant={r.status === "open" ? "warning" : "default"}>
                      {r.status}
                    </Badge>
                    <span className="text-[11px] text-[var(--foreground-muted)] tabular-nums">
                      {new Date(r.requested_at).toLocaleDateString("fr-TN")}
                    </span>
                  </div>
                  <div>{r.message}</div>
                  {r.fields?.length ? (
                    <div className="mt-1 text-[11px] text-[var(--foreground-muted)]">
                      Champs : {r.fields.join(", ")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Section>
        )}

        {(reports.data ?? []).length > 0 && (
          <Section title={`Signalements (${reports.data?.length})`}>
            <div className="space-y-2">
              {reports.data?.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-[var(--radius)] border p-3 text-sm ${
                    r.severity === "high"
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-amber-500/10 border-amber-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge size="sm">{r.reason}</Badge>
                    <span className="text-[11px] text-[var(--foreground-muted)] tabular-nums">
                      {new Date(r.created_at).toLocaleDateString("fr-TN")}
                    </span>
                  </div>
                  {r.detail && <div>{r.detail}</div>}
                  <div className="text-[11px] text-[var(--foreground-muted)] mt-1">
                    Signalé par : {r.reporter_label ?? "(anonyme)"}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title={`Offres (${bids.length})`}>
          <AdminBidsList bids={bids} auctionId={auction.id} />
        </Section>
      </div>
    </AdminShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-5">
      <h2 className="text-base font-bold mb-3">{title}</h2>
      {children}
    </div>
  );
}

/** A single labelled spec cell for the vehicle fiche technique. */
function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)]">
        {k}
      </div>
      <div className="text-sm font-semibold capitalize">{v || "—"}</div>
    </div>
  );
}

/** A document thumbnail (carte grise recto/verso). Renders a dashed
 *  placeholder when the URL is missing so the admin can see at a
 *  glance that the seller didn't supply that side. */
function DocCard({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-bold text-[var(--foreground-muted)]">
        {label}
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="block aspect-[4/3] rounded-[var(--radius)] overflow-hidden bg-black ring-1 ring-[var(--border)] hover:ring-[var(--gold)] transition-colors"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain"
          />
        </a>
      ) : (
        <div className="aspect-[4/3] rounded-[var(--radius)] border border-dashed border-[var(--border)] flex items-center justify-center text-xs text-[var(--foreground-muted)]">
          Non fourni
        </div>
      )}
    </div>
  );
}

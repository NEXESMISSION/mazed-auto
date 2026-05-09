// Supabase data layer — single source of truth for catalog data.
// All app pages MUST import from this module instead of any mock file.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Auction,
  Seller,
  Vehicle,
  AIAlert,
  TrustLevel,
  AuctionStatus,
  FuelType,
  Transmission,
  VehicleCondition,
  VehicleCategory,
} from "@/lib/types";
import { computeAlerts } from "@/lib/alerts";

// ===== Row shapes (what Supabase returns) =====

export interface SellerRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  trust_score: number;
  trust_level: TrustLevel;
  verified_kyc: boolean;
  verified_ownership: boolean;
  successful_deals: number;
  rating_average: number | string;
  rating_count: number;
  account_age_months: number;
  city: string;
  is_pro: boolean;
  is_active?: boolean | null;
}

export interface AuctionRow {
  id: string;
  seller_id: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  fuel_type: FuelType;
  transmission: Transmission;
  color: string;
  condition: VehicleCondition;
  category: VehicleCategory;
  description: string | null;
  features: string[];
  city: string;
  region: string;
  image_urls: string[];
  video_url: string | null;
  starting_price: number | string;
  reserve_price: number | string | null;
  buy_now_price: number | string | null;
  current_price: number | string;
  participation_deposit: number | string;
  bid_increment: number | string;
  start_time: string;
  end_time: string;
  original_end_time: string;
  status: AuctionStatus;
  reserve_met: boolean;
  total_bids: number;
  total_participants: number;
  is_featured: boolean;
  is_vip: boolean;
  alerts: AIAlert[] | null;
  reserve_decision_deadline?: string | null;
  current_winner_id?: string | null;
  payment_deadline?: string | null;
  seller?: SellerRow | null;
}

export interface BidRow {
  id: string;
  auction_id: string;
  user_id: string | null;
  bidder_label: string | null;
  amount: number | string;
  is_auto_bid: boolean;
  placed_at: string;
}

// ===== Mappers =====

const num = (v: number | string | null | undefined, fallback = 0): number =>
  v === null || v === undefined ? fallback : typeof v === "number" ? v : Number(v);

export function mapSeller(r: SellerRow): Seller {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url ?? undefined,
    trustScore: r.trust_score,
    trustLevel: r.trust_level,
    verifiedKyc: r.verified_kyc,
    verifiedOwnership: r.verified_ownership,
    successfulDeals: r.successful_deals,
    ratingAverage: num(r.rating_average),
    ratingCount: r.rating_count,
    accountAgeMonths: r.account_age_months,
    city: r.city,
    isPro: r.is_pro,
    // Old rows pre-migration won't have the column yet — treat as active.
    isActive: r.is_active ?? true,
  };
}

function mapVehicle(r: AuctionRow): Vehicle {
  return {
    id: r.id,
    make: r.make,
    model: r.model,
    year: r.year,
    mileage: r.mileage,
    fuelType: r.fuel_type,
    transmission: r.transmission,
    color: r.color,
    condition: r.condition,
    category: r.category,
    description: r.description ?? "",
    features: r.features ?? [],
    city: r.city,
    region: r.region,
    imageUrls: r.image_urls ?? [],
    videoUrl: r.video_url ?? undefined,
  };
}

const FALLBACK_SELLER: Seller = {
  id: "unknown",
  username: "unknown",
  displayName: "Inconnu",
  trustScore: 0,
  trustLevel: "new",
  verifiedKyc: false,
  verifiedOwnership: false,
  successfulDeals: 0,
  ratingAverage: 0,
  ratingCount: 0,
  accountAgeMonths: 0,
  city: "",
  isActive: true,
};

export function mapAuction(r: AuctionRow): Auction {
  const a: Auction = {
    id: r.id,
    vehicle: mapVehicle(r),
    seller: r.seller ? mapSeller(r.seller) : FALLBACK_SELLER,
    startingPrice: num(r.starting_price),
    reservePrice: r.reserve_price === null ? undefined : num(r.reserve_price),
    buyNowPrice: r.buy_now_price === null ? undefined : num(r.buy_now_price),
    currentPrice: num(r.current_price),
    participationDeposit: num(r.participation_deposit),
    bidIncrement: num(r.bid_increment),
    startTime: new Date(r.start_time),
    endTime: new Date(r.end_time),
    originalEndTime: new Date(r.original_end_time),
    status: r.status,
    reserveMet: r.reserve_met,
    totalBids: r.total_bids,
    totalParticipants: r.total_participants,
    isFeatured: r.is_featured,
    isVip: r.is_vip,
    alerts: r.alerts ?? undefined,
    reserveDecisionDeadline: r.reserve_decision_deadline
      ? new Date(r.reserve_decision_deadline)
      : undefined,
    currentWinnerId: r.current_winner_id ?? undefined,
    paymentDeadline: r.payment_deadline
      ? new Date(r.payment_deadline)
      : undefined,
  };
  // Merge DB-stored alerts with heuristic ones derived from auction signals
  // (PLAN §18). DB alerts win on duplicate titles.
  const derived = computeAlerts(a);
  const dbTitles = new Set((a.alerts ?? []).map((al) => al.title));
  const merged = [
    ...(a.alerts ?? []),
    ...derived.filter((d) => !dbTitles.has(d.title)),
  ];
  a.alerts = merged.length > 0 ? merged : undefined;
  return a;
}

// ===== Fetchers (work with both server & browser clients) =====

const AUCTION_SELECT = "*, seller:sellers(*)";

// ===== Home rails =====

const LIVE_STATUSES = ["active", "ending"] as const;
const FINAL_STATUSES = [
  "ended",
  "reserve_not_met",
  "pending_seller_decision",
] as const;

export interface HotAuction extends Auction {
  recentBids: number;
  recentBidders: number;
}

/**
 * "Hot right now" — live auctions with the most bids in the last hour.
 * Pulls the bid-count from the auction_hot_now view, then hydrates the
 * full auction rows in one IN-query so the rail still has all the data
 * AuctionCard expects. Falls back to total_bids ordering if the view is
 * missing (e.g. migrate-home-hot-rail.sql hasn't run yet).
 */
export async function listHotNow(
  supabase: SupabaseClient,
  limit: number = 6,
): Promise<HotAuction[]> {
  // 1) Fetch the ranking from the view.
  const { data: ranks, error: rankErr } = await supabase
    .from("auction_hot_now")
    .select("id, recent_bids, recent_bidders")
    .order("recent_bids", { ascending: false })
    .order("recent_bidders", { ascending: false })
    .limit(limit);

  // Fallback: when the view doesn't exist yet, just sort live auctions
  // by total bids — an OK approximation while the migration is pending.
  if (rankErr) {
    const { data } = await supabase
      .from("auctions")
      .select(AUCTION_SELECT)
      .in("status", LIVE_STATUSES as readonly string[])
      .gte("end_time", new Date().toISOString())
      .order("total_bids", { ascending: false })
      .limit(limit);
    return (data ?? []).map((r) => ({
      ...mapAuction(r as unknown as AuctionRow),
      recentBids: 0,
      recentBidders: 0,
    }));
  }
  if (!ranks || ranks.length === 0) return [];

  // 2) Hydrate the auctions in one IN-query, then re-order to match the
  //    rank list.
  const ids = ranks.map((r) => r.id as string);
  const { data: rows } = await supabase
    .from("auctions")
    .select(AUCTION_SELECT)
    .in("id", ids);
  const byId = new Map(
    (rows ?? []).map((r) => [
      (r as unknown as AuctionRow).id,
      mapAuction(r as unknown as AuctionRow),
    ]),
  );
  return ranks
    .map((r) => {
      const a = byId.get(r.id as string);
      if (!a) return null;
      return {
        ...a,
        recentBids: (r.recent_bids as number) ?? 0,
        recentBidders: (r.recent_bidders as number) ?? 0,
      };
    })
    .filter((x): x is HotAuction => x !== null);
}

/**
 * Live auctions ending within the next 24 hours, soonest first.
 * Excludes already-expired rows even if their status hasn't been swept
 * yet by end_expired_auctions().
 */
export async function listEndingSoon(
  supabase: SupabaseClient,
  hoursAhead: number = 24,
  limit: number = 6,
): Promise<Auction[]> {
  const now = new Date();
  const end = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("auctions")
    .select(AUCTION_SELECT)
    .in("status", LIVE_STATUSES as readonly string[])
    .gte("end_time", now.toISOString())
    .lte("end_time", end.toISOString())
    .order("end_time", { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => mapAuction(r as unknown as AuctionRow));
}

/** Most-recently-created live auctions, newest first. The earlier 48h
 *  gate caused the Nouveautés rail to disappear whenever the catalog had
 *  nothing brand new in the window, which read to users as "the slider
 *  was removed." `_hoursBack` is kept for call-site compat but ignored. */
export async function listNewestLive(
  supabase: SupabaseClient,
  _hoursBack: number = 48,
  limit: number = 10,
): Promise<Auction[]> {
  void _hoursBack;
  const { data, error } = await supabase
    .from("auctions")
    .select(AUCTION_SELECT)
    .in("status", LIVE_STATUSES as readonly string[])
    .gte("end_time", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => mapAuction(r as unknown as AuctionRow));
}

/** Featured + live auctions, soonest end first. */
export async function listFeaturedLive(
  supabase: SupabaseClient,
  limit: number = 6,
): Promise<Auction[]> {
  const { data, error } = await supabase
    .from("auctions")
    .select(AUCTION_SELECT)
    .eq("is_featured", true)
    .in("status", LIVE_STATUSES as readonly string[])
    .gte("end_time", new Date().toISOString())
    .order("end_time", { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => mapAuction(r as unknown as AuctionRow));
}

/**
 * Last N bid rows across all auctions, joined to vehicle make/model so
 * the home ticker can render anonymous "X bid Y on Z" pills with zero
 * extra client-side roundtrips. The shape matches what
 * LiveActivityTicker expects for its `initial` prop.
 */
export async function seedActivityItems(
  supabase: SupabaseClient,
  limit: number = 8,
): Promise<
  {
    id: string;
    auctionId: string | null;
    bidder: string;
    amount: number;
    vehicle: string;
    at: number;
  }[]
> {
  const { data } = await supabase
    .from("bids")
    .select(
      "id, auction_id, user_id, amount, placed_at, auctions:auction_id(make, model, year)",
    )
    .order("placed_at", { ascending: false })
    .limit(limit);
  if (!data) return [];
  return (data as unknown as Array<{
    id: string;
    auction_id: string | null;
    user_id: string | null;
    amount: number | string;
    placed_at: string;
    auctions: { make: string; model: string; year: number } | null;
  }>)
    .filter((r) => Boolean(r.auctions))
    .map((r) => ({
      id: r.id,
      auctionId: r.auction_id,
      // Same opaque tag rule as the client — keep identities anonymous.
      bidder: `Enchérisseur #${(r.user_id ?? "0000").replace(/-/g, "").slice(-4).toUpperCase()}`,
      amount: Number(r.amount),
      vehicle: r.auctions
        ? `${r.auctions.make} ${r.auctions.model} ${r.auctions.year}`
        : "Une voiture",
      at: new Date(r.placed_at).getTime(),
    }));
}

/**
 * Auctions that ended in the last `hoursBack` hours. Drives the
 * "Vendues récemment" rail — pure social proof + scarcity, the page
 * shows the final price instead of a countdown.
 */
export async function listRecentlyEnded(
  supabase: SupabaseClient,
  hoursBack: number = 72,
  limit: number = 6,
): Promise<Auction[]> {
  const cutoff = new Date(
    Date.now() - hoursBack * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("auctions")
    .select(AUCTION_SELECT)
    .in("status", FINAL_STATUSES as readonly string[])
    .gte("end_time", cutoff)
    .order("end_time", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => mapAuction(r as unknown as AuctionRow));
}

export async function listAuctions(
  supabase: SupabaseClient,
  opts: { featured?: boolean; status?: string[]; limit?: number } = {},
): Promise<Auction[]> {
  // Sweep expired auctions to ended/reserve_not_met/cancelled before reading.
  // Errors here (e.g. function missing) are non-fatal — we still return the list.
  try {
    await supabase.rpc("end_expired_auctions");
  } catch {
    // ignore — function may not be deployed yet
  }

  let q = supabase.from("auctions").select(AUCTION_SELECT);
  if (opts.featured) q = q.eq("is_featured", true);
  if (opts.status?.length) q = q.in("status", opts.status);
  q = q.order("end_time", { ascending: true });
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) {
    console.error("listAuctions:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapAuction(r as unknown as AuctionRow));
}

export async function getAuctionById(
  supabase: SupabaseClient,
  id: string,
): Promise<Auction | null> {
  const { data, error } = await supabase
    .from("auctions")
    .select(AUCTION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getAuctionById:", error.message);
    return null;
  }
  return data ? mapAuction(data as unknown as AuctionRow) : null;
}

export async function getSellerByUsername(
  supabase: SupabaseClient,
  username: string,
): Promise<Seller | null> {
  const { data, error } = await supabase
    .from("sellers")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (error || !data) return null;
  return mapSeller(data as SellerRow);
}

export async function getSellerById(
  supabase: SupabaseClient,
  id: string,
): Promise<Seller | null> {
  const { data, error } = await supabase
    .from("sellers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapSeller(data as SellerRow);
}

export async function listSellers(supabase: SupabaseClient): Promise<Seller[]> {
  const { data, error } = await supabase
    .from("sellers")
    .select("*")
    .order("trust_score", { ascending: false });
  if (error) {
    console.error("listSellers:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapSeller(r as SellerRow));
}

export interface UserActivityEntry {
  id: number;
  user_id: string;
  kind: string;
  detail: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Admin-side fetch for the user-activity feed surfaced on the user-detail
 * page. Returns the most recent entries for one user. RLS gates this to
 * admins (see migrate-user-activity.sql); for non-admin callers Supabase
 * silently returns an empty array, which is fine here — only admins
 * navigate to this page.
 */
export async function listUserActivity(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
): Promise<UserActivityEntry[]> {
  const { data, error } = await supabase
    .from("user_activity_log")
    .select("id,user_id,kind,detail,metadata,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listUserActivity:", error.message);
    return [];
  }
  return (data ?? []) as UserActivityEntry[];
}

export async function listAuctionsBySeller(
  supabase: SupabaseClient,
  sellerId: string,
): Promise<Auction[]> {
  const { data, error } = await supabase
    .from("auctions")
    .select(AUCTION_SELECT)
    .eq("seller_id", sellerId)
    .order("end_time", { ascending: true });
  if (error) return [];
  return (data ?? []).map((r) => mapAuction(r as unknown as AuctionRow));
}

export async function listRecentBids(
  supabase: SupabaseClient,
  auctionId: string,
  limit: number = 10,
): Promise<BidRow[]> {
  // Order by amount first, then recency, so the highest bid is always
  // labeled "Offre la plus haute" even if a slow lower bid lands later.
  const { data, error } = await supabase
    .from("bids")
    .select("*")
    .eq("auction_id", auctionId)
    .order("amount", { ascending: false })
    .order("placed_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as BidRow[];
}

export interface TransactionRow {
  id: string;
  ref: string;
  user_id: string | null;
  user_label: string | null;
  auction_id: string | null;
  type: "deposit" | "refund" | "final_payment" | "commission" | "payout";
  direction: "in" | "out";
  amount: number | string;
  label: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  created_at: string;
}

export async function listTransactions(
  supabase: SupabaseClient,
  opts: { userId?: string; limit?: number } = {},
): Promise<TransactionRow[]> {
  let q = supabase
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });
  if (opts.userId) q = q.eq("user_id", opts.userId);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as TransactionRow[];
}

export interface NotificationRow {
  id: string;
  user_id: string;
  auction_id: string | null;
  kind:
    | "outbid"
    | "won"
    | "lost"
    | "new_bid"
    | "approved"
    | "rejected"
    | "payment_due"
    | "reminder"
    | "system";
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

export async function listNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 50,
): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as NotificationRow[];
}

export interface ReportRow {
  id: string;
  auction_id: string;
  reporter_id: string | null;
  reporter_label: string | null;
  reason: string;
  detail: string | null;
  severity: "low" | "normal" | "high";
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  auction?: AuctionRow | null;
}

export async function listReports(
  supabase: SupabaseClient,
  status?: ReportRow["status"][],
): Promise<ReportRow[]> {
  let q = supabase
    .from("reports")
    .select("*, auction:auctions(*, seller:sellers(*))")
    .order("created_at", { ascending: false });
  if (status?.length) q = q.in("status", status);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as unknown as ReportRow[];
}

export interface ConversationRow {
  id: string;
  buyer_id: string;
  seller_id: string;
  auction_id: string | null;
  last_message_at: string;
  created_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface SellerRatingRow {
  id: string;
  seller_id: string;
  buyer_label: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export async function listSellerRatings(
  supabase: SupabaseClient,
  sellerId: string,
  limit: number = 10,
): Promise<SellerRatingRow[]> {
  const { data, error } = await supabase
    .from("seller_ratings")
    .select("*")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as SellerRatingRow[];
}

export async function getPlatformStats(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("platform_stats")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return {
    activeAuctions: data?.active_auctions ?? 0,
    completedDeals: data?.completed_deals ?? 0,
    verifiedSellers: data?.verified_sellers ?? 0,
    satisfaction: num(data?.satisfaction),
  };
}

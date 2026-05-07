export type FuelType = "gasoline" | "diesel" | "hybrid" | "electric";
export type Transmission = "manual" | "automatic";
export type VehicleCondition = "new" | "excellent" | "good" | "fair" | "damaged";
export type VehicleCategory =
  | "sedan"
  | "suv"
  | "hatchback"
  | "pickup"
  | "van"
  | "coupe"
  | "convertible"
  | "wagon";
export type AuctionStatus =
  | "scheduled"
  | "active"
  | "ending"
  | "ended"
  | "cancelled"
  | "reserve_not_met"
  | "pending_review"
  | "pending_seller_decision"
  | "re_offered";

export type TrustLevel =
  | "new"
  | "low"
  | "trusted"
  | "very_trusted"
  | "verified_pro";

export interface Seller {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  trustScore: number;
  trustLevel: TrustLevel;
  verifiedKyc: boolean;
  verifiedOwnership: boolean;
  successfulDeals: number;
  ratingAverage: number;
  ratingCount: number;
  accountAgeMonths: number;
  city: string;
  isPro?: boolean;
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  fuelType: FuelType;
  transmission: Transmission;
  color: string;
  condition: VehicleCondition;
  category: VehicleCategory;
  description: string;
  features: string[];
  city: string;
  region: string;
  imageUrls: string[]; // 12 photos
  videoUrl?: string;
  hasInspectionReport?: boolean;
}

export interface AIAlert {
  type: "info" | "warning";
  title: string;
  detail: string;
  suggestion?: string;
}

export interface Auction {
  id: string;
  vehicle: Vehicle;
  seller: Seller;
  startingPrice: number;
  reservePrice?: number;
  buyNowPrice?: number;
  currentPrice: number;
  participationDeposit: number; // 5% of starting
  bidIncrement: number;
  startTime: Date;
  endTime: Date;
  originalEndTime: Date;
  status: AuctionStatus;
  reserveMet: boolean;
  totalBids: number;
  totalParticipants: number;
  isFeatured: boolean;
  isVip: boolean;
  alerts?: AIAlert[];
  reserveDecisionDeadline?: Date;
  /** Set when status='ended' or 're_offered' — the user whose payment we're
   *  waiting on. Forfeit re-points this to the next bidder. (PLAN §21.4) */
  currentWinnerId?: string;
  /** When the current winner must complete final_payment by, else forfeit. */
  paymentDeadline?: Date;
}

export interface Bid {
  id: string;
  auctionId: string;
  userId: string;
  amount: number;
  placedAt: Date;
  isWinning: boolean;
  isAutoBid: boolean;
}

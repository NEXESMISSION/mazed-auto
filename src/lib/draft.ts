"use client";

import { useEffect, useState, useCallback } from "react";

const KEY = "mazed_auction_draft";
// Drafts persist for 7 days. The wizard has photos, a video and a carte
// grise upload — losing all of that to a tab refresh (the previous
// sessionStorage behaviour) was a real foot-gun. After a week we treat
// the in-flight draft as abandoned and clear it on next read.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuctionDraft {
  // step 1
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  fuelType?: "gasoline" | "diesel" | "hybrid" | "electric";
  transmission?: "manual" | "automatic";
  color?: string;
  vin?: string;
  registration?: string;
  category?:
    | "sedan"
    | "suv"
    | "hatchback"
    | "pickup"
    | "van"
    | "coupe"
    | "convertible"
    | "wagon";
  condition?: "new" | "excellent" | "good" | "fair" | "damaged";
  features?: string[];
  city?: string;
  region?: string;
  description?: string;

  // step 2
  imageUrls?: string[];

  // step 3
  videoUrl?: string;

  // step 4 (carte grise)
  ownerName?: string;
  ownershipException?: string;
  // True when the seller picked the "other" exception — the auction needs
  // a manual admin review before it can go live (PLAN §11.3 Golden Lock).
  requiresOwnershipReview?: boolean;
  // Recto / verso photos of the carte grise. Previously these lived
  // only in step-4's local useState — meaning if the user clicked
  // "Modifier" from /review and came back, both slots were empty and
  // they had to re-photograph the document. Persisting them here keeps
  // the wizard's "navigate back, edit one thing, return" flow intact.
  cartegriseFrontUrl?: string;
  cartegriseBackUrl?: string;

  // step 5
  startingPrice?: number;
  reservePrice?: number;
  buyNowPrice?: number;
  durationDays?: 3 | 7 | 14;

  // step 5 — paid boosts (see auction.featured_listing_fee / vip / top_of_search settings)
  boostFeatured?: boolean;     // appear on home page
  boostVip?: boolean;          // VIP push notifications
  boostTopOfSearch?: boolean;  // pinned 24h on top of search
}

interface Envelope {
  v: 1;
  savedAt: number;
  draft: AuctionDraft;
}

function read(): AuctionDraft {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Envelope | AuctionDraft;
    // Legacy shape (older sessionStorage payloads) was the raw draft.
    // Accept it once, then re-write under the envelope on next update.
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "savedAt" in parsed &&
      "draft" in parsed
    ) {
      const env = parsed as Envelope;
      if (Date.now() - env.savedAt > TTL_MS) {
        localStorage.removeItem(KEY);
        return {};
      }
      return env.draft ?? {};
    }
    return (parsed as AuctionDraft) ?? {};
  } catch {
    return {};
  }
}

function write(d: AuctionDraft) {
  if (typeof window === "undefined") return;
  const env: Envelope = { v: 1, savedAt: Date.now(), draft: d };
  localStorage.setItem(KEY, JSON.stringify(env));
  window.dispatchEvent(new Event("mazed-draft-change"));
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("mazed-draft-change"));
}

export function useDraft() {
  const [draft, setDraft] = useState<AuctionDraft>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setDraft(read());
    setHydrated(true);
    const onChange = () => setDraft(read());
    /* eslint-enable react-hooks/set-state-in-effect */
    window.addEventListener("mazed-draft-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("mazed-draft-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = useCallback((patch: Partial<AuctionDraft>) => {
    const next = { ...read(), ...patch };
    write(next);
    setDraft(next);
  }, []);

  return { draft, hydrated, update };
}

"use client";

import { useEffect, useState, useCallback } from "react";

const KEY = "mazed_auction_draft";

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

  // step 5
  startingPrice?: number;
  reservePrice?: number;
  buyNowPrice?: number;
  durationDays?: 3 | 7 | 14;
}

function read(): AuctionDraft {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuctionDraft) : {};
  } catch {
    return {};
  }
}

function write(d: AuctionDraft) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(d));
  window.dispatchEvent(new Event("mazed-draft-change"));
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event("mazed-draft-change"));
}

export function useDraft() {
  const [draft, setDraft] = useState<AuctionDraft>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDraft(read());
    setHydrated(true);
    const onChange = () => setDraft(read());
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

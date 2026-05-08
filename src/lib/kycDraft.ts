"use client";

// Tiny sessionStorage-backed draft for the KYC flow. Each step captures
// one piece, saves the resulting public URL here, then the processing
// step picks them all up to insert a single kyc_submissions row.

const KEY = "mazed_kyc_draft";

export interface KycDraft {
  idFrontUrl?: string;
  idBackUrl?: string;
  selfieVideoUrl?: string;
  selfieImageUrl?: string;
}

export function readKycDraft(): KycDraft {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as KycDraft) : {};
  } catch {
    return {};
  }
}

export function updateKycDraft(patch: Partial<KycDraft>) {
  if (typeof window === "undefined") return;
  const next = { ...readKycDraft(), ...patch };
  sessionStorage.setItem(KEY, JSON.stringify(next));
}

export function clearKycDraft() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}

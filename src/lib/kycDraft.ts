"use client";

// Tiny sessionStorage-backed draft for the KYC flow. Each step captures
// one piece, saves the resulting public URL here, then the processing
// step picks them all up to insert a single kyc_submissions row.

const KEY = "mazed_kyc_draft";
const TAG = "[KYC/draft]";
function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
   
  console.log(
    `%c${TAG} %c${ts}`,
    "color:#d4af37;font-weight:bold",
    "color:#888",
    ...args,
  );
}

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
    const draft = raw ? (JSON.parse(raw) as KycDraft) : {};
    log("read", draft);
    return draft;
  } catch (e) {
    log("read failed", e);
    return {};
  }
}

export function updateKycDraft(patch: Partial<KycDraft>) {
  if (typeof window === "undefined") return;
  const next = { ...readKycDraft(), ...patch };
  log("update", { patch, next });
  sessionStorage.setItem(KEY, JSON.stringify(next));
}

export function clearKycDraft() {
  if (typeof window === "undefined") return;
  log("clear");
  sessionStorage.removeItem(KEY);
}

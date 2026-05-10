// Server- and client-safe helpers shared between auth.ts (client) and
// auth-provider.tsx + the layout SSR. Anything that needs to be called
// from a server component must live here, NOT in auth.ts (which has
// "use client" and is therefore unreachable from server code).

import type { User as SupabaseUser } from "@supabase/supabase-js";

export interface AppUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  trustScore: number;
  kycStatus: "none" | "pending" | "verified" | "rejected";
  emailVerified: boolean;
  phoneVerified: boolean;
  role: "buyer" | "seller" | "admin";
}

/**
 * Normalise a raw Supabase user into the app shape used everywhere.
 * Reads name fields from both the form-based signup metadata and the
 * Google OAuth metadata fallbacks so the user sees their real name on
 * the home header without an extra profile-edit step.
 */
export function mapUser(u: SupabaseUser | null): AppUser | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const firstFromMeta = (meta.firstName as string) || "";
  const lastFromMeta = (meta.lastName as string) || "";
  let firstName = firstFromMeta;
  let lastName = lastFromMeta;
  if (!firstName) {
    const given = (meta.given_name as string) || "";
    const fullName =
      (meta.full_name as string) || (meta.name as string) || "";
    if (given) {
      firstName = given;
    } else if (fullName) {
      const [first, ...rest] = fullName.trim().split(/\s+/);
      firstName = first ?? "";
      if (!lastName) lastName = rest.join(" ");
    }
  }
  if (!lastName) lastName = (meta.family_name as string) || "";

  // Phone fallback uses `||` not `??` — Supabase returns `u.phone` as
  // `""` (empty string, not null) for OAuth users, and `??` only falls
  // back on null/undefined. Without this, an empty top-level value
  // would lock us into the empty value and ignore the metadata phone
  // we wrote during the post-signup completion step.
  const phoneFromTop = (u.phone ?? "").trim();
  const phoneFromMeta = ((meta.phone as string | undefined) ?? "").trim();

  return {
    id: u.id,
    firstName,
    lastName,
    email: u.email ?? "",
    phone: phoneFromTop || phoneFromMeta,
    trustScore: (meta.trustScore as number) ?? 0,
    kycStatus: (meta.kycStatus as AppUser["kycStatus"]) ?? "none",
    emailVerified: Boolean(u.email_confirmed_at),
    phoneVerified: Boolean(u.phone_confirmed_at),
    role: (meta.role as AppUser["role"]) ?? "buyer",
  };
}

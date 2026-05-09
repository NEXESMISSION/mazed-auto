"use client";

import { useEffect, useState, useCallback } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

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

function mapUser(u: SupabaseUser | null): AppUser | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  // Google OAuth puts the user's name in `full_name` / `name` / `given_name`
  // / `family_name` rather than the firstName/lastName pair our sign-up
  // form writes. Fall back to those so OAuth users see their real name on
  // the home header without a follow-up profile-edit step.
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
  // back on null/undefined. Using `??` would lock us into the empty
  // top-level value and ignore the metadata phone we wrote during the
  // post-signup completion step, causing PhoneCompletionGate to loop.
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

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(mapUser(data.user));
      setLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(mapUser(session?.user ?? null));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = useCallback(
    async (input: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone: string;
      role?: "buyer" | "seller";
    }) => {
      const supabase = createClient();
      const { error, data } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            role: input.role ?? "buyer",
            trustScore: 0,
            kycStatus: "none",
          },
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback`
              : undefined,
        },
      });
      return { error, data };
    },
    [],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const supabase = createClient();
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error, data };
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    const supabase = createClient();
    return supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const supabase = createClient();
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined,
    });
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const supabase = createClient();
    return supabase.auth.updateUser({ password });
  }, []);

  const sendPhoneOtp = useCallback(async (phone: string) => {
    const supabase = createClient();
    return supabase.auth.signInWithOtp({ phone });
  }, []);

  const verifyPhoneOtp = useCallback(
    async (phone: string, token: string) => {
      const supabase = createClient();
      return supabase.auth.verifyOtp({ phone, token, type: "sms" });
    },
    [],
  );

  const resendEmailVerification = useCallback(async (email: string) => {
    const supabase = createClient();
    return supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
    });
  }, []);

  const update = useCallback(
    async (patch: Partial<AppUser>) => {
      const supabase = createClient();
      const meta: Record<string, unknown> = {};
      if (patch.firstName !== undefined) meta.firstName = patch.firstName;
      if (patch.lastName !== undefined) meta.lastName = patch.lastName;
      if (patch.phone !== undefined) meta.phone = patch.phone;
      if (patch.role !== undefined) meta.role = patch.role;
      if (patch.trustScore !== undefined) meta.trustScore = patch.trustScore;
      if (patch.kycStatus !== undefined) meta.kycStatus = patch.kycStatus;
      const { data, error } = await supabase.auth.updateUser({ data: meta });
      if (data.user) setUser(mapUser(data.user));
      return { error };
    },
    [],
  );

  return {
    user,
    loaded,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    sendPasswordReset,
    updatePassword,
    sendPhoneOtp,
    verifyPhoneOtp,
    resendEmailVerification,
    update,
    // legacy aliases for older pages still using mock-auth shape
    login: signIn,
    logout: signOut,
  };
}

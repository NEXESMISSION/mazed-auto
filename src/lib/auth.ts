"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthState } from "@/lib/auth-provider";
// Shared user shape + mapper live in a non-"use client" module so the
// SSR layout can import them too — server components can't pull from
// a "use client" file. Re-export here so existing imports keep working.
import { mapUser, type AppUser } from "@/lib/auth-shared";
export { mapUser } from "@/lib/auth-shared";
export type { AppUser } from "@/lib/auth-shared";

export function useAuth() {
  // Prefer the shared AuthProvider context — when present, the user is
  // already seeded from SSR so consumers render with the right value
  // on their first paint. Fall back to a local-state machine when no
  // provider is wrapped above (older isolated tests / storybook).
  const ctx = useAuthState();
  const [localUser, setLocalUser] = useState<AppUser | null>(null);
  const [localLoaded, setLocalLoaded] = useState(false);

  useEffect(() => {
    if (ctx) return; // provider already running its own subscription
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setLocalUser(mapUser(data.user));
      setLocalLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setLocalUser(mapUser(session?.user ?? null));
    });
    return () => sub.subscription.unsubscribe();
  }, [ctx]);

  const user = ctx ? ctx.user : localUser;
  const loaded = ctx ? ctx.loaded : localLoaded;
  // Used by signOut and update — the provider owns its own state, so
  // when we mutate (e.g. clear on sign-out), we still want a local
  // setter for the no-provider fallback.
  const setUser = (u: AppUser | null) => {
    if (!ctx) setLocalUser(u);
    // With the provider wrapped, supabase.auth.onAuthStateChange will
    // fire and the provider will pick up the new state automatically.
  };

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

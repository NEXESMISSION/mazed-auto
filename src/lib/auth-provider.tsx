"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { mapUser, type AppUser } from "./auth-shared";
import { createClient } from "./supabase/client";

interface AuthState {
  user: AppUser | null;
  loaded: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

interface ProviderProps {
  /** SSR-resolved user, passed from the locale layout. */
  initialUser: AppUser | null;
  children: React.ReactNode;
}

/**
 * Seeds the auth state with the user resolved server-side, so client
 * components that depend on `user` get the real value on their FIRST
 * render. Without this, every consumer of `useAuth()` started with
 * `user = null` for ~50-100 ms while the client-side `getUser()`
 * fetch resolved — which made auth-gated UI flash:
 *  - HeaderIcons hid the bell, then showed it.
 *  - FavoriteButton stayed at opacity-50, then locked in a state.
 *  - PhoneCompletionGate could pop up briefly even for users who
 *    actually have a phone (gate evaluated against the null user
 *    before the real one arrived).
 *  - BidComposer cycled through Login/KYC/Deposit gates as the
 *    user resolved.
 *
 * The provider stays subscribed to onAuthStateChange so subsequent
 * sign-ins / sign-outs / metadata updates flow through too.
 */
export function AuthProvider({ initialUser, children }: ProviderProps) {
  const [user, setUser] = useState<AppUser | null>(initialUser);
  // We "have" the auth state from the moment we mount — SSR already
  // resolved it. Keep `loaded=true` so consumers don't show a
  // skeleton waiting on us.
  const [loaded] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(mapUser(session?.user ?? null));
    });

    // Refresh the session whenever the tab regains focus or becomes
    // visible. Supabase embeds user_metadata in the JWT, so server-side
    // changes (admin KYC approval, role promotion, trust-score bump,
    // etc.) only propagate to the client on the next token refresh —
    // which is otherwise hourly. Without this, a freshly-approved user
    // keeps seeing "KYC en cours" on their profile chip until they
    // sign out and back in. The /kyc/status page used to be the only
    // surface that polled refreshSession(); now every page benefits.
    //
    // refreshSession() is a no-op when there's no active session, and
    // Supabase debounces concurrent refresh calls — safe to call
    // freely on every focus event.
    let lastRefresh = 0;
    const REFRESH_THROTTLE_MS = 5_000;
    function maybeRefresh() {
      if (typeof document !== "undefined" && document.hidden) return;
      const now = Date.now();
      if (now - lastRefresh < REFRESH_THROTTLE_MS) return;
      lastRefresh = now;
      supabase.auth.refreshSession().catch(() => {
        // Network blip — the listener above will pick up on the next
        // successful refresh; nothing to surface to the user.
      });
    }
    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", maybeRefresh);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", maybeRefresh);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loaded }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Returns the SSR-seeded auth state. `null` if used outside the
 * provider — callers should fall back to their own state machine in
 * that case (the regular `useAuth()` hook does exactly that).
 */
export function useAuthState(): AuthState | null {
  return useContext(AuthContext);
}

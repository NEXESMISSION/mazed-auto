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
    return () => sub.subscription.unsubscribe();
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

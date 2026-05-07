"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Bottom-of-profile sign-out. Matches the menu-row card aesthetic — same
 * rounded surface, divided-list visual rhythm — but flagged danger so it
 * doesn't blend in with regular settings rows.
 */
export function SignOutButton() {
  const router = useRouter();
  const { signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-3.5 flex items-center justify-center gap-2 text-sm font-bold text-[var(--danger)] hover:bg-red-500/10 hover:border-[var(--danger)]/40 transition-colors"
    >
      <LogOut className="h-4 w-4" />
      Se déconnecter
    </button>
  );
}

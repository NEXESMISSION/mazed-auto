import type { SupabaseClient, User } from "@supabase/supabase-js";
import { routing, type Locale } from "@/i18n/routing";

/**
 * The language someone reads the site in, for what we send them away from it
 * (SMS, e-mail).
 *
 * Kept in the auth user's metadata (`language`), written when the account is
 * opened and whenever they sign in from a page in another language. NOT
 * `profiles.language`: that column defaults to 'ar' and every account created
 * before Arabic existed carries it, so it cannot tell a choice from a default.
 * No `language` in the metadata means nobody chose, which means French — the
 * language every existing account has been reading in.
 */
export function userLanguage(user: Pick<User, "user_metadata"> | null | undefined): Locale {
  const lang = user?.user_metadata?.language;
  return (routing.locales as readonly string[]).includes(lang) ? (lang as Locale) : routing.defaultLocale;
}

/** Records `language` on the auth user and on the profile. Best effort. */
export async function rememberLanguage(admin: SupabaseClient, userId: string, language: Locale): Promise<void> {
  await Promise.all([
    // GoTrue merges user_metadata key by key: full_name and phone stay.
    admin.auth.admin.updateUserById(userId, { user_metadata: { language } }).then(() => {}, () => {}),
    admin.from("profiles").update({ language }).eq("id", userId).then(() => {}, () => {}),
  ]);
}

/** The language of each user, fetched once per user (one auth lookup each). */
export async function languagesOf(admin: SupabaseClient, userIds: string[]): Promise<Map<string, Locale>> {
  const out = new Map<string, Locale>();
  await Promise.all(
    [...new Set(userIds)].map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id).catch(() => ({ data: null }));
      out.set(id, userLanguage(data?.user));
    }),
  );
  return out;
}

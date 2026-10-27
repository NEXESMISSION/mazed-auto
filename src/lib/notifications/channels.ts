import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether the notification jobs send SMS and e-mails (D-B4,
 * `app_settings.notification_channels`, 0197). The in-app bell always gets
 * every notification, and the sign-in code is sent whatever this says: it is
 * not a notification.
 */
export type NotificationChannels = { sms: boolean; email: boolean };

export const DEFAULT_CHANNELS: NotificationChannels = { sms: true, email: true };

/** Only an explicit false turns a channel off: a missing setting changes nothing. */
export function readChannels(value: unknown): NotificationChannels {
  const v = (value ?? {}) as Partial<Record<keyof NotificationChannels, unknown>>;
  return { sms: v.sms !== false, email: v.email !== false };
}

export async function fetchNotificationChannels(admin: SupabaseClient): Promise<NotificationChannels> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "notification_channels").maybeSingle();
  return readChannels(data?.value);
}

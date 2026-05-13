"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Side-effect-only client component. Marks the notification as read
 * once the user lands on its detail page. Sits inside the server-
 * rendered NotificationDetail so the rest of the page stays static
 * + fast on first paint.
 */
export function MarkRead({
  id,
  alreadyRead,
}: {
  id: string;
  alreadyRead: boolean;
}) {
  useEffect(() => {
    if (alreadyRead) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .then(() => {
        /* fire-and-forget; the realtime UPDATE event will refresh
         * any open notif list. RLS already enforces user_id =
         * auth.uid() so we can't accidentally read someone else's. */
      });
  }, [id, alreadyRead]);
  return null;
}

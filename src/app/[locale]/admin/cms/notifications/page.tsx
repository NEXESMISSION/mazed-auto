import { createClient } from "@/lib/supabase/server";
import { NotifTemplatesEditor } from "./NotifTemplatesEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CmsNotifTemplates() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_templates")
    .select(
      "kind, locale, title, body, in_app, email, sms, push, updated_at",
    )
    .order("kind", { ascending: true })
    .order("locale", { ascending: true });
  return <NotifTemplatesEditor initial={(data ?? []) as never[]} />;
}

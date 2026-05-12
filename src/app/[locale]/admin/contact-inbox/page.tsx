import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { ContactInboxList } from "./ContactInboxList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContactInboxPage() {
  const supabase = await createClient();
  // Explicit column projection — the `ip_address` column has an `inet`
  // type that the Supabase JS client serializes as a string anyway, and
  // we don't display it in this table. Dropping it (and the rarely-set
  // reply_body, which can be long) keeps the payload small as the
  // inbox grows.
  const { data, error } = await supabase
    .from("contact_messages")
    .select(
      "id, name, email, topic, body, user_id, status, reply_body, replied_by, replied_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            Boîte de réception — Contact
          </h1>
          <Badge variant="gold">{data?.length ?? 0}</Badge>
        </div>
        {error && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200">
            Erreur : {error.message}
          </div>
        )}
        <ContactInboxList initial={(data ?? []) as never[]} />
      </div>
    </AdminShell>
  );
}

import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ q?: string }>;
}

interface Conv {
  id: string;
  buyer_id: string;
  seller_id: string;
  auction_id: string | null;
  last_message_at: string | null;
  created_at: string;
  message_count: number;
  buyer_label: string;
  seller_label: string;
  auction_title: string;
}

export default async function AdminMessagesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_conversations", {
    p_search: sp.q?.trim() || null,
    p_limit: 200,
  });
  const rows = (error ? [] : (data as Conv[])) ?? [];

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            Modération des conversations
          </h1>
          <Badge variant="gold">{rows.length}</Badge>
        </div>
        <p className="text-xs text-[var(--foreground-muted)]">
          Lecture des conversations privées pour modération uniquement (abus,
          harcèlement, fraude). Chaque accès est journalisé avec votre raison.
        </p>

        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Email acheteur ou vendeur"
            className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 h-11 text-sm"
          />
          <button
            type="submit"
            className="bg-[var(--gold)] text-black font-bold h-11 px-4 rounded-[var(--radius)] text-sm"
          >
            Rechercher
          </button>
        </form>

        {error && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200">
            Erreur : {error.message}
          </div>
        )}

        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
          {rows.length === 0 && (
            <div className="p-12 text-center text-sm text-[var(--foreground-muted)]">
              Aucune conversation.
            </div>
          )}
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/admin/messages/${c.id}`}
              className="block p-4 hover:bg-[var(--surface-2)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-sm">
                  {c.buyer_label} ⇄ {c.seller_label}
                </div>
                <Badge size="sm">{c.message_count} msg</Badge>
              </div>
              <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                {c.auction_title}
              </div>
              <div className="text-[10px] text-[var(--foreground-subtle)] mt-1 tabular-nums">
                {c.last_message_at
                  ? "dernier : " +
                    new Date(c.last_message_at).toLocaleString("fr-FR")
                  : "créée " + new Date(c.created_at).toLocaleString("fr-FR")}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}

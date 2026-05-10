import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/Button";
import { ModerationReader } from "./ModerationReader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminConversationPage({ params }: Props) {
  const { id } = await params;
  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        <Link
          href="/admin/messages"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux conversations
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold">
          Lecture pour modération
        </h1>
        <p className="text-xs text-[var(--foreground-muted)]">
          Indiquez la raison de la consultation. Sans raison enregistrée, le
          contenu reste masqué.
        </p>
        <ModerationReader conversationId={id} />
      </div>
    </AdminShell>
  );
}

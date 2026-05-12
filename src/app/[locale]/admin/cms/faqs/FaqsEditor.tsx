"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Plus, Save, Trash2, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { upsertFaq, deleteFaq } from "../actions";

interface Faq {
  id: string;
  position: number;
  question_ar: string | null;
  question_fr: string;
  answer_ar: string | null;
  answer_fr: string;
  is_published: boolean;
  updated_at: string;
}

export function FaqsEditor({ initial }: { initial: Faq[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Faq[]>(initial);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Partial<Faq> | null>(null);

  function newDraft() {
    const nextPos =
      items.length === 0 ? 10 : Math.max(...items.map((i) => i.position)) + 10;
    setDraft({
      id: "",
      position: nextPos,
      question_fr: "",
      answer_fr: "",
      is_published: true,
    });
  }

  function save(item: Partial<Faq>) {
    if (!item.question_fr?.trim() || !item.answer_fr?.trim()) {
      toast("Question et réponse FR requises", "warning");
      return;
    }
    start(async () => {
      const r = await upsertFaq({
        id: item.id || undefined,
        position: item.position ?? 0,
        questionAr: item.question_ar ?? null,
        questionFr: item.question_fr ?? "",
        answerAr: item.answer_ar ?? null,
        answerFr: item.answer_fr ?? "",
        isPublished: item.is_published ?? true,
      });
      if (!r.ok) {
        toast("Échec : " + r.error, "error");
        return;
      }
      toast("✓ Enregistré", "success");
      setDraft(null);
      router.refresh();
    });
  }

  async function remove(id: string) {
    if (!window.confirm("Supprimer cette FAQ ?")) return;
    const r = await deleteFaq(id);
    if (!r.ok) {
      toast("Échec : " + r.error, "error");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast("Supprimée", "warning");
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={newDraft}>
          <Plus className="h-4 w-4" />
          Nouvelle FAQ
        </Button>
      </div>
      {draft && (
        <FaqRow
          item={draft as Faq}
          onSave={(it) => save(it)}
          onCancel={() => setDraft(null)}
          isNew
          pending={pending}
        />
      )}
      {items.map((it) => (
        <FaqRow
          key={it.id}
          item={it}
          onSave={(x) => save(x)}
          onDelete={() => remove(it.id)}
          pending={pending}
        />
      ))}
    </div>
  );
}

function FaqRow({
  item,
  onSave,
  onDelete,
  onCancel,
  isNew,
  pending,
}: {
  item: Faq;
  onSave: (i: Faq) => void;
  onDelete?: () => void;
  onCancel?: () => void;
  isNew?: boolean;
  pending: boolean;
}) {
  const [data, setData] = useState<Faq>(item);
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3">
      <div className="grid md:grid-cols-[100px_1fr] gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
            Position
          </label>
          <Input
            type="number"
            value={data.position}
            onChange={(e) =>
              setData((d) => ({ ...d, position: Number(e.target.value) }))
            }
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
            Question (FR)
          </label>
          <Input
            value={data.question_fr}
            onChange={(e) =>
              setData((d) => ({ ...d, question_fr: e.target.value }))
            }
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
          Réponse (FR)
        </label>
        <textarea
          value={data.answer_fr}
          onChange={(e) =>
            setData((d) => ({ ...d, answer_fr: e.target.value }))
          }
          rows={3}
          className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
          Question (AR)
        </label>
        <Input
          dir="rtl"
          value={data.question_ar ?? ""}
          onChange={(e) =>
            setData((d) => ({ ...d, question_ar: e.target.value }))
          }
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
          Réponse (AR)
        </label>
        <textarea
          dir="rtl"
          value={data.answer_ar ?? ""}
          onChange={(e) =>
            setData((d) => ({ ...d, answer_ar: e.target.value }))
          }
          rows={3}
          className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.is_published}
            onChange={(e) =>
              setData((d) => ({ ...d, is_published: e.target.checked }))
            }
          />
          Publié
        </label>
        {!data.is_published && (
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
            <EyeOff className="h-3 w-3" />
            Masqué
          </span>
        )}
        <div className="ms-auto flex gap-2">
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Annuler
            </Button>
          )}
          <Button size="sm" onClick={() => onSave(data)} disabled={pending}>
            <Save className="h-4 w-4" />
            {isNew ? "Créer" : "Enregistrer"}
          </Button>
          {onDelete && (
            <Button size="sm" variant="danger" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { attributeLabel, unitLabel } from "@/lib/labels";
import { AdminButton } from "@/components/admin/AdminButton";
import {
  TextField, SelectField, NumberField, ToggleField, FieldGrid,
  Confirm, useAdminAction, EYEBROW,
} from "@/components/admin/kit";
import { Plus, Trash2, X, GripVertical } from "lucide-react";

/**
 * The right pane: what an annonce in this category is made of.
 *
 * These rows drive both the seller's wizard and the admin's creation form, and
 * `filterable` decides whether a buyer can narrow the catalog by them — so
 * this screen is where "kilométrage" becomes a filter rather than a developer
 * ticket.
 */

export type Attribute = {
  id: string;
  fieldKey: string;
  label: string;
  dataType: string;
  options: { value: string; label: string }[] | null;
  unit: string | null;
  required: boolean;
  filterable: boolean;
  sortOrder: number;
  /** How many listings already carry a value under this key. */
  usedBy: number;
};

/** The data types, named under `admin.catalogue.editor.types`. */
const TYPES = ["text", "number", "boolean", "select"];

export function AttributeEditor({
  categoryId,
  categoryLabel,
  attributes,
}: {
  categoryId: string;
  categoryLabel: string;
  attributes: Attribute[];
}) {
  const t = useTranslations("admin.catalogue.editor");
  const locale = useLocale();
  const [editing, setEditing] = useState<Attribute | "new" | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-5">
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-semibold tracking-tight text-foreground">
            {categoryLabel}
          </h2>
        </div>
        <AdminButton
          variant="primary"
          icon={<Plus className="size-3.5" strokeWidth={2.8} />}
          onClick={() => setEditing("new")}
        >
          {t("addAttribute")}
        </AdminButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {editing && (
          <AttributeForm
            key={editing === "new" ? "new" : editing.id}
            categoryId={categoryId}
            attribute={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}

        {attributes.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-subtle">
            {t("empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {attributes.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  className="flex w-full items-start gap-3 px-5 py-2.5 text-start transition hover:bg-[var(--row-hover)]"
                >
                  <GripVertical
                    className="mt-0.5 size-3.5 shrink-0 text-subtle"
                    strokeWidth={2}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                      <span className="truncate">{attributeLabel(a.fieldKey, a.label, locale)}</span>
                      {a.required && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--tone-warn)]">
                          {t("requiredTag")}
                        </span>
                      )}
                      {a.filterable && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gold)]">
                          {t("filterTag")}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-subtle">
                      {TYPES.includes(a.dataType) ? t(`types.${a.dataType}`) : a.dataType}
                      {a.unit ? ` · ${unitLabel(a.unit, locale)}` : ""}
                      {a.options ? ` · ${t("optionsCount", { count: a.options.length })}` : ""}
                      {" · "}
                      <code className="text-[11px] opacity-70">{a.fieldKey}</code>
                    </span>
                  </span>
                  {a.usedBy > 0 && (
                    <span className="batta-tabular shrink-0 text-[11px] text-subtle">
                      {t("usedBy", { count: a.usedBy })}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AttributeForm({
  categoryId,
  attribute,
  onDone,
}: {
  categoryId: string;
  attribute: Attribute | null;
  onDone: () => void;
}) {
  const t = useTranslations("admin.catalogue.editor");
  const { run, pending } = useAdminAction();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [label, setLabel] = useState(attribute?.label ?? "");
  const [dataType, setDataType] = useState(attribute?.dataType ?? "text");
  const [unit, setUnit] = useState(attribute?.unit ?? "");
  const [required, setRequired] = useState(attribute?.required ?? false);
  const [filterable, setFilterable] = useState(attribute?.filterable ?? false);
  const [sortOrder, setSortOrder] = useState<number | null>(attribute?.sortOrder ?? 100);
  const [options, setOptions] = useState<{ value: string; label: string }[]>(
    attribute?.options ?? [],
  );

  const isNew = attribute === null;

  async function save() {
    const ok = await run({
      url: "/api/admin/catalogue",
      method: "POST",
      body: {
        action: "attribute.save",
        ...(isNew ? {} : { id: attribute.id }),
        category_id: categoryId,
        label,
        data_type: dataType,
        options: dataType === "select" ? options : null,
        unit,
        required,
        filterable,
        sort_order: sortOrder,
      },
      success: isNew ? t("added") : t("saved"),
    });
    if (ok) onDone();
  }

  return (
    <div className="border-b border-border bg-[var(--gold-faint)] px-5 py-4">
      <div className="flex items-center justify-between">
        <h3 className={`${EYEBROW} text-[var(--gold)]`}>
          {isNew ? t("newTitle") : attribute.label}
        </h3>
        <button
          type="button"
          onClick={onDone}
          aria-label={t("close")}
          className="grid size-6 place-items-center text-subtle transition hover:text-foreground"
        >
          <X className="size-3.5" strokeWidth={2.4} />
        </button>
      </div>

      <div className="mt-3 space-y-3.5">
        <FieldGrid>
          <TextField
            label={t("label")}
            value={label}
            onChange={setLabel}
            required
            placeholder="Kilométrage, Boîte, Carburant…"
          />
          <SelectField
            label={t("type")}
            value={dataType}
            onChange={setDataType}
            disabled={!isNew}
            hint={isNew ? undefined : t("typeLocked")}
            options={TYPES.map((value) => ({ value, label: t(`types.${value}`) }))}
          />
        </FieldGrid>

        <FieldGrid>
          <TextField
            label={t("unit")}
            value={unit}
            onChange={setUnit}
            placeholder="km, ch, L…"
            hint={t("unitHint")}
          />
          <NumberField
            label={t("order")}
            value={sortOrder}
            onChange={setSortOrder}
            min={0}
            hint={t("orderHint")}
          />
        </FieldGrid>

        {dataType === "select" && (
          <div>
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-subtle">
              {t("options")}
            </span>
            <ul className="mt-2 space-y-1.5">
              {options.map((o, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    value={o.label}
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                      )
                    }
                    placeholder={t("optionPlaceholder")}
                    className="h-8 flex-1 border-b border-border bg-transparent px-1 text-[12.5px] text-foreground placeholder:text-subtle focus:border-[var(--gold)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={t("removeOption")}
                    className="grid size-6 place-items-center text-subtle transition hover:text-[var(--tone-bad)]"
                  >
                    <X className="size-3.5" strokeWidth={2.4} />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setOptions((prev) => [...prev, { value: "", label: "" }])}
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--gold)] hover:underline"
            >
              <Plus className="size-3" strokeWidth={2.8} /> {t("addOption")}
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <ToggleField
            label={t("required")}
            checked={required}
            onChange={setRequired}
            hint={t("requiredHint")}
          />
          <ToggleField
            label={t("filterable")}
            checked={filterable}
            onChange={setFilterable}
            hint={t("filterableHint")}
          />
        </div>

        <div className="flex items-center gap-2">
          <AdminButton
            variant="primary"
            pending={pending}
            disabled={!label.trim()}
            disabledReason={t("labelRequired")}
            onClick={save}
          >
            {isNew ? t("add") : t("save")}
          </AdminButton>
          <AdminButton variant="quiet" onClick={onDone}>
            {t("cancel")}
          </AdminButton>
          {!isNew && (
            <AdminButton
              variant="quiet"
              className="ms-auto"
              icon={<Trash2 className="size-3.5" strokeWidth={2.4} />}
              onClick={() => setConfirmDelete(true)}
            >
              {t("delete")}
            </AdminButton>
          )}
        </div>
      </div>

      <Confirm
        open={confirmDelete}
        title={t("deleteTitle")}
        body={t("deleteBody")}
        confirmLabel={t("delete")}
        pending={pending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const ok = await run({
            url: "/api/admin/catalogue",
            method: "POST",
            body: { action: "attribute.delete", id: attribute!.id },
            success: t("deleted"),
          });
          if (ok) {
            setConfirmDelete(false);
            onDone();
          }
        }}
      />
    </div>
  );
}

"use client";

import { useLocale } from "next-intl";
import { attributeLabel, attributeOptionLabel, unitLabel } from "@/lib/labels";

/**
 * The form primitives shared by every surface that composes an annonce: the
 * seller wizard (`/annonces/nouvelle`) and the admin's manual creation panel.
 *
 * They live here rather than inside the wizard because a category attribute is
 * rendered from data — `category_attributes` decides the label, the type and
 * whether it is required — and two implementations of that rendering would
 * quietly disagree the first time someone adds an attribute type. One file,
 * one answer, both screens.
 */

export type ListingAttribute = {
  fieldKey: string;
  label: string;
  dataType: "number" | "text" | "boolean" | "select";
  options: { value: string; label: string }[] | null;
  unit: string | null;
  required: boolean;
};

export const INPUT =
  "mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[13.5px] text-foreground placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold-soft disabled:opacity-50";

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted">
      {children}
    </span>
  );
}

export function Field({
  label, value, onChange, placeholder, type = "text", disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
      />
    </label>
  );
}

export function CheckField({
  label, checked, onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--gold)]"
      />
      {label}
    </label>
  );
}

/**
 * One category attribute, rendered from its own definition. Its label, options
 * and unit are stored in French; src/lib/labels.ts words the known ones in the
 * page's language and leaves an attribute it does not know as the admin wrote it.
 */
export function AttributeField({
  attr, value, onChange,
}: {
  attr: ListingAttribute;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const locale = useLocale();
  const label = attributeLabel(attr.fieldKey, attr.label, locale);
  if (attr.dataType === "boolean") {
    return <CheckField label={label} checked={value === true} onChange={onChange} />;
  }
  if (attr.dataType === "select" && attr.options) {
    return (
      <label className="block">
        <Label>{label}{attr.required && " *"}</Label>
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={INPUT}>
          <option value="">—</option>
          {attr.options.map((o) => (
            <option key={o.value} value={o.value}>
              {attributeOptionLabel(attr.fieldKey, o.value, o.label, locale)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <Field
      label={attr.unit ? `${label} (${unitLabel(attr.unit, locale)})` : label + (attr.required ? " *" : "")}
      type={attr.dataType === "number" ? "number" : "text"}
      value={(value as string) ?? ""}
      onChange={onChange}
    />
  );
}

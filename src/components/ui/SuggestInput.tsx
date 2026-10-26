"use client";

import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { fold, suggestions } from "@/lib/suggest";

/**
 * A text field with its own suggestion list — make, model, year, part brand.
 *
 * It replaces `<input list>` + `<datalist>`, which is the browser's list, not
 * ours: desktop Chrome draws a proper dropdown, but on phones it is anywhere
 * from a thin strip above the keyboard to nothing at all (Firefox for Android,
 * the Facebook and Instagram in-app browsers). On the same page, the models
 * « appeared » on a laptop and « did not work » on a phone — and most sellers
 * publish from a phone.
 *
 * Free text stays allowed: the lists are the common makes and models, not all
 * of them. Tapping the field shows every option; typing filters them (see
 * `suggestions` in lib/suggest).
 */
export function SuggestInput({
  id,
  value,
  onChange,
  options,
  placeholder,
  className,
  inputMode,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  /** Classes for the input itself. */
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const shown = useMemo(() => suggestions(value, options), [value, options]);

  const isOpen = open && shown.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;

  function pick(o: string) {
    onChange(o);
    setOpen(false);
    setActive(-1);
  }

  function move(to: number) {
    setActive(to);
    listRef.current?.children[to]?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) setOpen(true);
      move(Math.min(shown.length - 1, active + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(Math.max(0, active - 1));
    } else if (e.key === "Enter" && isOpen && active >= 0) {
      // Pick the highlighted option rather than submit the form.
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={isOpen && active >= 0 ? optionId(active) : undefined}
        aria-label={ariaLabel}
        // The browser's own autofill dropdown would sit on top of ours.
        autoComplete="off"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={className}
      />
      {isOpen && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] animate-[batta-float-up_140ms_ease-out_both]"
        >
          {shown.map((o, i) => (
            <li
              key={o}
              id={optionId(i)}
              role="option"
              aria-selected={fold(o) === fold(value)}
              // Keep the input focused: a blur here would close the list
              // before the tap lands on the option.
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "cursor-pointer truncate rounded-lg px-3 py-2.5 text-start text-[14px] text-foreground",
                i === active ? "bg-surface-2" : "",
                fold(o) === fold(value) ? "font-semibold text-[var(--gold)]" : "",
              )}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

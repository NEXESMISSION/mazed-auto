"use client";

/**
 * Scroll the first invalid form field into view (centered) and flash it red.
 * Each field's outer container should set `data-field="<key>"`. Pass the keys
 * of the missing fields in DOM order; the first one found becomes the scroll
 * target, all of them get the red flash for 2.5s.
 *
 * Returns true if at least one field was flagged.
 */
export function scrollToFirstInvalid(missing: string[]): boolean {
  if (missing.length === 0) return false;
  if (typeof document === "undefined") return false;

  document.querySelectorAll(".field-invalid").forEach((el) => {
    el.classList.remove("field-invalid");
  });

  let scrolled = false;
  let flagged = false;
  for (const key of missing) {
    const el = document.querySelector<HTMLElement>(`[data-field="${key}"]`);
    if (!el) continue;
    flagged = true;
    if (!scrolled) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const focusable = el.querySelector<HTMLElement>(
        "input, select, textarea, [contenteditable=true]",
      );
      focusable?.focus({ preventScroll: true });
      scrolled = true;
    }
    el.classList.add("field-invalid");
    setTimeout(() => el.classList.remove("field-invalid"), 2500);
  }
  return flagged;
}

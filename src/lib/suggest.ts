/**
 * Which options a SuggestInput shows for what has been typed.
 *
 * Nothing typed, or exactly one of the options (a field already filled in):
 * all of them, so tapping a filled field still offers the other choices.
 * Otherwise the options that contain the text, those that start with it first.
 * Case and accents are ignored: « citroen » finds « Citroën ».
 */
export function suggestions(typed: string, options: readonly string[]): string[] {
  const q = fold(typed);
  if (!q || options.some((o) => fold(o) === q)) return [...options];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const o of options) {
    const f = fold(o);
    if (f.startsWith(q)) starts.push(o);
    else if (f.includes(q)) contains.push(o);
  }
  return [...starts, ...contains];
}

/** Lowercase, accents removed, trimmed. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

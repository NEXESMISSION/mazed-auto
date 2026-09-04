import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";

/**
 * The one list in the console.
 *
 * Twenty admin sections currently render their rows twenty different ways —
 * two `<table>`s and eighteen sets of hand-built cards — so column alignment,
 * row height, hover, and what an empty list looks like all differ per screen.
 * Everything goes through this now.
 *
 * Three decisions worth recording:
 *
 * - **It is a grid, not a `<table>`.** The whole row has to be clickable, and
 *   an anchor cannot wrap a `<tr>`. A CSS grid lets each row *be* the link:
 *   one tab stop, one focus ring, keyboard-navigable for free. ARIA roles
 *   carry the table semantics a screen reader needs.
 * - **It stays a server component.** Cells arrive as already-rendered
 *   `ReactNode`s and rows carry an `href`, so no callback ever has to cross
 *   the server/client boundary and no queue needs `"use client"` just to list
 *   things. Row selection (Phase 2) wraps this rather than replacing it.
 * - **Detail lives in the URL.** A row links to `?panel=<id>`; the server
 *   reads that param and renders the side panel. Back closes the panel, and a
 *   half-reviewed row can be sent to someone as a link.
 */

export type Column = {
  key: string;
  label: string;
  /** Grid track. Defaults to `minmax(0,1fr)`; use `120px` for fixed columns. */
  width?: string;
  align?: "left" | "right";
  /** Hide this column below a breakpoint — the phone gets the essentials. */
  hideBelow?: "sm" | "md" | "lg";
};

export type Row = {
  id: string;
  /** Makes the whole row a link. Omit for a static row. */
  href?: string;
  cells: Record<string, React.ReactNode>;
  /** Left edge marker — for rows that are late, blocked or otherwise urgent. */
  flag?: "warn" | "bad";
};

const HIDE: Record<NonNullable<Column["hideBelow"]>, string> = {
  sm: "hidden sm:block",
  md: "hidden md:block",
  lg: "hidden lg:block",
};

const FLAG: Record<NonNullable<Row["flag"]>, string> = {
  warn: "before:bg-[rgba(245,158,11,0.75)]",
  bad: "before:bg-[rgba(239,68,68,0.8)]",
};

export function DataTable({
  columns,
  rows,
  empty,
  caption,
}: {
  columns: Column[];
  rows: Row[];
  /** Rendered instead of the rows when there are none — always pass one. */
  empty: React.ReactNode;
  /** Screen-reader name for the list. */
  caption?: string;
}) {
  if (rows.length === 0) return <div className="mt-4">{empty}</div>;

  // One track per column, plus a trailing chevron gutter when rows link out.
  const linkable = rows.some((r) => r.href);
  const template =
    columns.map((c) => c.width ?? "minmax(0,1fr)").join(" ") + (linkable ? " 20px" : "");

  return (
    <div
      role="table"
      aria-label={caption}
      className="mt-4 overflow-hidden rounded-xl border border-border bg-surface"
    >
      {/* Header. Sticky so the columns stay named while a long queue scrolls. */}
      <div
        role="row"
        style={{ gridTemplateColumns: template }}
        className="sticky top-0 z-10 grid gap-3 border-b border-border bg-surface-2/95 px-4 py-2.5 backdrop-blur-sm"
      >
        {columns.map((c) => (
          <div
            key={c.key}
            role="columnheader"
            className={`truncate text-[10px] font-extrabold uppercase tracking-[0.13em] text-muted ${
              c.align === "right" ? "text-right" : ""
            } ${c.hideBelow ? HIDE[c.hideBelow] : ""}`}
          >
            {c.label}
          </div>
        ))}
        {linkable && <div aria-hidden />}
      </div>

      <div role="rowgroup">
        {rows.map((row) => {
          const inner = (
            <>
              {columns.map((c) => (
                <div
                  key={c.key}
                  role="cell"
                  className={`min-w-0 self-center text-[13px] text-foreground ${
                    c.align === "right" ? "text-right" : ""
                  } ${c.hideBelow ? HIDE[c.hideBelow] : ""}`}
                >
                  {row.cells[c.key] ?? <span className="text-subtle">—</span>}
                </div>
              ))}
              {linkable && (
                <ChevronRight
                  aria-hidden
                  className="size-4 self-center text-subtle transition group-hover:text-gold"
                  strokeWidth={2}
                />
              )}
            </>
          );

          const shared = `group relative grid items-center gap-3 border-b border-border/60 px-4 py-3 text-start last:border-b-0 ${
            row.flag
              ? `before:absolute before:inset-y-0 before:start-0 before:w-[3px] ${FLAG[row.flag]}`
              : ""
          }`;

          return row.href ? (
            <Link
              key={row.id}
              role="row"
              href={row.href as "/admin"}
              style={{ gridTemplateColumns: template }}
              className={`${shared} transition hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--gold)]`}
            >
              {inner}
            </Link>
          ) : (
            <div
              key={row.id}
              role="row"
              style={{ gridTemplateColumns: template }}
              className={shared}
            >
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Two-line cell — the pattern every queue needs and every queue reinvents:
 * the thing, and the quiet line under it that says whose it is.
 */
export function Stacked({
  top,
  bottom,
}: {
  top: React.ReactNode;
  bottom?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate font-semibold text-foreground">{top}</div>
      {bottom != null && (
        <div className="truncate text-[11.5px] text-muted">{bottom}</div>
      )}
    </div>
  );
}

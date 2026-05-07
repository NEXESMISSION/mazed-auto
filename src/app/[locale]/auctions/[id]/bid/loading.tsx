export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-[var(--border)] px-4 py-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full skeleton shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="h-4 w-1/2 rounded skeleton" />
          <div className="h-3 w-1/3 rounded skeleton" />
        </div>
      </div>
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-4">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-5 space-y-3">
          <div className="h-3 w-16 rounded skeleton" />
          <div className="h-10 w-2/3 rounded skeleton" />
          <div className="h-3 w-1/2 rounded skeleton" />
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-5 space-y-3">
          <div className="h-12 w-full rounded skeleton" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 flex-1 rounded skeleton" />
            ))}
          </div>
          <div className="h-12 w-full rounded skeleton" />
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-4 space-y-2">
          <div className="h-3 w-20 rounded skeleton" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded skeleton" />
          ))}
        </div>
      </div>
    </div>
  );
}

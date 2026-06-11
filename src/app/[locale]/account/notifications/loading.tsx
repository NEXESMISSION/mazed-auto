import { ListRowsSkeleton } from "@/components/ui/Skeleton";

/**
 * Centre de notifications leads with eyebrow + title + a 2-pill filter
 * strip, then icon-led rows (no cover thumbnails). Mirror that footprint
 * so the loading→content swap doesn't reflow.
 */
export default function Loading() {
  return <ListRowsSkeleton rows={6} tabs={2} withThumb={false} />;
}

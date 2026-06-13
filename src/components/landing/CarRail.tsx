import { PropertyCard } from "@/components/property/PropertyCard";
import { TrendingRail } from "@/components/landing/TrendingRail";
import type { AuctionWithProperty } from "@/lib/types";

/**
 * Reusable car rail — mobile horizontal snap-rail + desktop 4-col grid of
 * PropertyCards. Mirrors the inline trending-rail pattern so new home rails
 * (HotNow, etc.) stay consistent without duplicating the JSX each time.
 */
export function CarRail({
  items,
  savedIds,
  loggedIn,
  hot = false,
}: {
  items: AuctionWithProperty[];
  savedIds: Set<string>;
  loggedIn: boolean;
  /** Render each card with the glowing red "hot" FOMO pill (bid count). */
  hot?: boolean;
}) {
  if (!items.length) return null;
  return (
    <>
      <div className="lg:hidden">
        <TrendingRail>
          {items.map((a) => (
            <div key={a.id} className="w-[230px] shrink-0 snap-start">
              <PropertyCard auction={a} saved={savedIds.has(a.id)} loggedIn={loggedIn} hot={hot} />
            </div>
          ))}
          <div className="w-1 shrink-0" />
        </TrendingRail>
      </div>
      <div className="mt-4 hidden lg:grid lg:grid-cols-4 lg:gap-5 lg:px-6">
        {items.slice(0, 8).map((a) => (
          <PropertyCard key={a.id} auction={a} saved={savedIds.has(a.id)} loggedIn={loggedIn} hot={hot} />
        ))}
      </div>
    </>
  );
}

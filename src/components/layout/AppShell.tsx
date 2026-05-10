import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";
import { PullToRefresh } from "./PullToRefresh";
import { SideSwipeNav } from "./SideSwipeNav";
import { PhoneCompletionGate } from "./PhoneCompletionGate";
import { MaintenanceBanner } from "./MaintenanceBanner";
import { DesktopHeader } from "./DesktopHeader";

interface Props {
  children: React.ReactNode;
  /** Hide the sticky top bar — used on flagship screens (home, auction
   *  detail, browse) where the page provides its own top affordance.
   *  Only affects the MOBILE TopBar; the global DesktopHeader always
   *  renders on lg+ regardless. */
  noTopBar?: boolean;
}

export function AppShell({ children, noTopBar }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MaintenanceBanner />

      {/* Global desktop header — only visible at lg+. Renders for every
          page, including those that opt out of the mobile TopBar via
          noTopBar (home, browse, auction detail). Page-specific mobile
          headers (HomeHeader, BrowseHeader, ScreenHeader) are gated
          lg:hidden so they don't double up. */}
      <DesktopHeader />

      <PullToRefresh />
      {/* Edge-swipe between bottom-tab destinations. Only fires when
          the touch starts within ~36 px of the left or right edge so
          inline horizontal scrollers (HeroCarousel, marquees, chip
          strips) keep their swipe gestures unmolested. */}
      <SideSwipeNav />
      {!noTopBar && <TopBar />}
      <main
        id="app-main"
        className="flex-1 pb-[calc(var(--bottombar-h)+env(safe-area-inset-bottom))] md:pb-12 will-change-transform"
      >
        {children}
      </main>
      <BottomTabBar />
      {/* Non-dismissible phone-completion modal for users who signed up
          via Google OAuth (or any path that didn't capture a phone).
          Stays up until they submit a valid number. */}
      <PhoneCompletionGate />
    </div>
  );
}

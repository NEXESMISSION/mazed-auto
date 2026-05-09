import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";
import { PullToRefresh } from "./PullToRefresh";
import { PhoneCompletionGate } from "./PhoneCompletionGate";

interface Props {
  children: React.ReactNode;
  /** Hide the sticky top bar — used on flagship screens (home, auction
   *  detail, browse) where the page provides its own top affordance. */
  noTopBar?: boolean;
}

export function AppShell({ children, noTopBar }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PullToRefresh />
      {!noTopBar && <TopBar />}
      <main className="flex-1 pb-[calc(var(--bottombar-h)+env(safe-area-inset-bottom))]">
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

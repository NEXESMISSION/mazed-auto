import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";

interface Props {
  children: React.ReactNode;
  /** Hide the sticky top bar — used on flagship screens (home, auction
   *  detail, browse) where the page provides its own top affordance. */
  noTopBar?: boolean;
}

export function AppShell({ children, noTopBar }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {!noTopBar && <TopBar />}
      <main className="flex-1 pb-[calc(var(--bottombar-h)+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
}

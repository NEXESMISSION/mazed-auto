import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";
import { PullToRefresh } from "./PullToRefresh";
import { SideSwipeNav } from "./SideSwipeNav";
import { PhoneCompletionGate } from "./PhoneCompletionGate";
import { MaintenanceBanner } from "./MaintenanceBanner";
import { DesktopHeader } from "./DesktopHeader";
import { KycReminderPopup } from "./KycReminderPopup";
import { SupportFab } from "./SupportFab";
import { getSupportEmail, getSupportPhone } from "@/lib/config";

interface Props {
  children: React.ReactNode;
  /** Hide the sticky top bar — used on flagship screens (home, auction
   *  detail, browse) where the page provides its own top affordance.
   *  Only affects the MOBILE TopBar; the global DesktopHeader always
   *  renders on lg+ regardless. */
  noTopBar?: boolean;
}

export async function AppShell({ children, noTopBar }: Props) {
  // Pulled server-side from platform_settings so admins can change the
  // public phone/email/WhatsApp number without redeploying the app.
  // Fetched in parallel; falls back to compiled defaults if the table
  // is unreachable (e.g. fresh checkout).
  const [supportPhone, supportEmail] = await Promise.all([
    getSupportPhone(),
    getSupportEmail(),
  ]);

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
      {/* Soft, skippable KYC nudge — only shows when the signed-in user
          hasn't verified yet, and snoozes 24h after every dismissal so
          it doesn't nag on every page navigation. */}
      <KycReminderPopup />
      {/* Floating support widget — WhatsApp / phone / email. Hides on
          KYC/payment/wizard routes so it doesn't overlap critical CTAs. */}
      <SupportFab phone={supportPhone} email={supportEmail} />
    </div>
  );
}

import { Suspense } from "react";
import { miniAppUrl } from "@/core/links";
import { getPlatform, isMobile } from "@/platform/server";
import { BottomBar } from "./BottomBar";
import { shellUser } from "./data";
import { DesktopChrome } from "./DesktopChrome";
import { DialogHost } from "./DialogHost";
import { HintsProvider } from "./Hints";
import { MobileExtras } from "./MobileExtras";
import { PageTransition } from "./PageTransition";
import { qrPath } from "./qr";
import { SystemBanner } from "./SystemBanner";
import { TopBar } from "./TopBar";

/**
 * The app frame around every screen. It lives in the (app) layout, so it stays
 * mounted across navigations: mobile (Telegram Mini App or phone browser) gets
 * App/TopBar + bottom buttons, desktop gets Nav/Sidebar with the keyboard layer.
 */
export async function Shell({ children }: { children: React.ReactNode }) {
  const [platform, user] = await Promise.all([getPlatform(), shellUser()]);
  if (isMobile(platform)) {
    return (
      <div className="sh-mobile">
        <TopBar signedIn={!!user} />
        <Suspense fallback={null}>
          <SystemBanner />
        </Suspense>
        <PageTransition mobile>
          <main className="sh-main" id="main">
            <HintsProvider signedIn={!!user} telegramLinked={!!user?.telegramLinked} dismissed={user?.hints ?? null}>{children}</HintsProvider>
          </main>
        </PageTransition>
        <MobileExtras signedIn={!!user} needsReauth={!!user?.needsReauth} email={user?.email} />
        <BottomBar />
        <DialogHost />
      </div>
    );
  }
  return (
    <div className="sh-desktop">
      <DesktopChrome
        user={user && { name: user.name, subtitle: user.subtitle, telegramLinked: user.telegramLinked, syncedAt: user.syncedAt }}
        inviteQr={qrPath(miniAppUrl({ to: "today" }))}
      />
      <div className="sh-desktop__main">
        <Suspense fallback={null}>
          <SystemBanner />
        </Suspense>
        <PageTransition mobile={false}>
          <main className="sh-main" id="main">
            <HintsProvider signedIn={!!user} telegramLinked={!!user?.telegramLinked} dismissed={user?.hints ?? null}>{children}</HintsProvider>
          </main>
        </PageTransition>
        <MobileExtras signedIn={!!user} needsReauth={!!user?.needsReauth} email={user?.email} desktop />
        <BottomBar />
      </div>
      <DialogHost />
    </div>
  );
}

"use client";

/** Everything a client screen needs from the platform layer, in one import. */
export { usePlatform, useTelegramReady, useMainButton, useSecondaryButton, useBackButton, useSettingsButton, useBottomButtons } from "./hooks";
export { haptic, confirm, popup, scanQr, closeScanQr, cloudStorage, homeScreenStatus, addToHomeScreen, requestWriteAccess, downloadFile, openTelegramLink, openLink, closeMiniApp } from "./native";
export { setTheme } from "./PlatformProvider";
export { inTelegram, webApp, whenWebApp } from "./telegram";
export type { BottomButton } from "./store";

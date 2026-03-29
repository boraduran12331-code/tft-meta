// src/types/electron.d.ts
// Global type declarations for the contextBridge-exposed electronAPI

interface HotkeyPayload { interactKey: string; visibilityKey: string }
interface OverlayStatePayload { isVisible: boolean; isInteractive: boolean }
type Unsubscribe = () => void

interface ElectronAPI {
  overlay: {
    toggleInteractive(interactive: boolean): Promise<void>
    toggleVisibility(): Promise<void>
    hide(): Promise<void>
    show(): Promise<void>
    hideMgr(): Promise<void>
    setOpacity(opacity: number): Promise<void>
    toggleVisibilityNow(): void
    toggleInteractiveNow(): void
    setCompactMode(compact: boolean): Promise<void>
    getHotkeys(): Promise<HotkeyPayload>
    setInteractKey(key: string): Promise<{ success: boolean; error?: string }>
    setVisibilityKey(key: string): Promise<{ success: boolean; error?: string }>
    getState(): Promise<OverlayStatePayload>
    getWindowBounds(): Promise<{ x: number; y: number; width: number; height: number } | null>
    saveWindowBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>
    onInteractiveState(callback: (interactive: boolean) => void): Unsubscribe
    onStateChanged(callback: (state: OverlayStatePayload) => void): Unsubscribe
    onHotkeysChanged(callback: (hotkeys: HotkeyPayload) => void): Unsubscribe
  }

  clipboard: {
    writeText(text: string): Promise<boolean>
  }

  metaTFT: {
    scrapeLiveComps(): Promise<string>
    apiFetch(url: string): Promise<string>
  }

  riotApi: {
    getKey(): Promise<string>
    setKey(key: string): Promise<void>
    getRegion(): Promise<string>
    setRegion(region: string): Promise<void>
  }

  lcu: {
    getStatus(): Promise<{ connected: boolean; phase?: string }>
    onConnected(callback: (info: any) => void): Unsubscribe
    onDisconnected(callback: () => void): Unsubscribe
    onGameflowPhase(callback: (phase: string) => void): Unsubscribe
    onGameflowSession(callback: (session: any) => void): Unsubscribe
    onEndOfGameStats(callback: (stats: any) => void): Unsubscribe
    onSummonerInfo(callback: (info: any) => void): Unsubscribe
    onLobbyParticipants(callback: (participants: string[]) => void): Unsubscribe
  }

  livegame: {
    getStatus(): Promise<any>
    onAttached(callback: (stats: any) => void): Unsubscribe
    onDetached(callback: () => void): Unsubscribe
    onStatsUpdate(callback: (stats: any) => void): Unsubscribe
    onTFTRoundChange(callback: (tftState: any) => void): Unsubscribe
    onTFTState(callback: (state: any) => void): Unsubscribe
  }

  notif: {
    onNotification(callback: (payload: any) => void): Unsubscribe
    push(payload: any): void
    notifyEmpty(): void
    notifyActive(): void
    test(): void
    getBounds(): Promise<any>
    saveBounds(b: any): Promise<any>
  }

  logs: {
    openLogFile(): Promise<void>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}

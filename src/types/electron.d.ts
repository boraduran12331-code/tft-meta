export interface HotkeyResult {
  success: boolean
  error?: string
}

export interface OverlayStatePayload {
  isVisible: boolean
  isInteractive: boolean
}

export interface HotkeyPayload {
  interactKey: string
  visibilityKey: string
}

export interface ElectronAPI {
  overlay: {
    // Legacy
    toggleInteractive(interactive: boolean): Promise<void>
    toggleVisibility(): Promise<void>
    hide(): Promise<void>
    setOpacity(opacity: number): Promise<void>

    // ControlPanel button actions
    show(): Promise<void>
    hideMgr(): Promise<void>
    toggleVisibilityNow(): Promise<void>
    toggleInteractiveNow(): Promise<void>

    // Hotkey management
    getHotkeys(): Promise<HotkeyPayload>
    setInteractKey(key: string): Promise<HotkeyResult>
    setVisibilityKey(key: string): Promise<HotkeyResult>
    getState(): Promise<OverlayStatePayload & HotkeyPayload>

    // Events
    onInteractiveState(callback: (interactive: boolean) => void): () => void
    onStateChanged(callback: (state: OverlayStatePayload) => void): () => void
    onHotkeysChanged(callback: (hotkeys: HotkeyPayload) => void): () => void
  }

  clipboard: {
    writeText(text: string): Promise<boolean>
  }

  metaTFT?: {
    scrapeLiveComps(): Promise<any>
    apiFetch(url: string): Promise<string>
  }

  lcu: {
    getStatus(): Promise<{ connected: boolean; phase: string; port: number | null }>
    onConnected(callback: (info: any) => void): () => void
    onDisconnected(callback: () => void): () => void
    onGameflowPhase(callback: (phase: string) => void): () => void
    onGameflowSession(callback: (session: any) => void): () => void
    onEndOfGameStats(callback: (stats: any) => void): () => void
    onSummonerInfo(callback: (info: any) => void): () => void
  }

  livegame: {
    getStatus(): Promise<{ gameMode: string; gameTime: number; mapName: string; mapNumber: number } | null>
    onAttached(callback: (stats: any) => void): () => void
    onDetached(callback: () => void): () => void
    onStatsUpdate(callback: (stats: any) => void): () => void
    onTFTRoundChange(callback: (tftState: any) => void): () => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

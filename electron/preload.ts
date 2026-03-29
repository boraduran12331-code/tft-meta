import { contextBridge, ipcRenderer } from 'electron'

// ─── Expose Safe APIs to Renderer ───────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  // Overlay controls
  overlay: {
    // Legacy invoke calls (keep for OverlayPanel.tsx compat)
    toggleInteractive: (interactive: boolean) => ipcRenderer.invoke('overlay:toggle-interactive', interactive),
    toggleVisibility: () => ipcRenderer.invoke('overlay:toggle-visibility'),
    hide: () => ipcRenderer.invoke('overlay:hide'),
    setOpacity: (opacity: number) => ipcRenderer.invoke('overlay:set-opacity', opacity),

    // ── NEW: ControlPanel actions ──
    // Show the overlay window
    show: () => ipcRenderer.invoke('overlay:show'),
    // Hide the overlay window
    hideMgr: () => ipcRenderer.invoke('overlay:hide-manager'),
    // Toggle visibility now (button action)
    toggleVisibilityNow: () => ipcRenderer.invoke('overlay:toggle-visibility-now'),
    // Toggle interactive now (button action)
    toggleInteractiveNow: () => ipcRenderer.invoke('overlay:toggle-interactive-now'),

    // ── Hotkey management ──
    getHotkeys: () => ipcRenderer.invoke('overlay:get-hotkeys'),
    setInteractKey: (key: string) => ipcRenderer.invoke('overlay:set-interact-key', key),
    setVisibilityKey: (key: string) => ipcRenderer.invoke('overlay:set-visibility-key', key),
    getState: () => ipcRenderer.invoke('overlay:get-state'),

    // ── Events ──
    onInteractiveState: (callback: (interactive: boolean) => void) => {
      const handler = (_e: any, interactive: boolean) => callback(interactive)
      ipcRenderer.on('overlay:interactive-state', handler)
      return () => ipcRenderer.removeListener('overlay:interactive-state', handler)
    },
    // Overlay state broadcast (isVisible + isInteractive from OverlayManager)
    onStateChanged: (callback: (state: { isVisible: boolean; isInteractive: boolean }) => void) => {
      const handler = (_e: any, state: any) => callback(state)
      ipcRenderer.on('overlay:state-changed', handler)
      return () => ipcRenderer.removeListener('overlay:state-changed', handler)
    },
    // Hotkeys changed event
    onHotkeysChanged: (callback: (hotkeys: { interactKey: string; visibilityKey: string }) => void) => {
      const handler = (_e: any, hotkeys: any) => callback(hotkeys)
      ipcRenderer.on('overlay:hotkeys-changed', handler)
      return () => ipcRenderer.removeListener('overlay:hotkeys-changed', handler)
    }
  },

  // Clipboard
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  },

  // Scraper API (legacy kept for compat) + direct API fetch proxy
  metaTFT: {
    scrapeLiveComps: () => ipcRenderer.invoke('scrape:metatft'),
    apiFetch: (url: string) => ipcRenderer.invoke('api:fetch', url),
  },

  // Riot Client Gateway (LCU via lcu-connector & ws)
  lcu: {
    getStatus: () => ipcRenderer.invoke('lcu:status'),

    onConnected: (callback: (info: any) => void) => {
      const handler = (_e: any, info: any) => callback(info)
      ipcRenderer.on('lcu:connected', handler)
      return () => ipcRenderer.removeListener('lcu:connected', handler)
    },
    onDisconnected: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('lcu:disconnected', handler)
      return () => ipcRenderer.removeListener('lcu:disconnected', handler)
    },
    onGameflowPhase: (callback: (phase: string) => void) => {
      const handler = (_e: any, phase: string) => callback(phase)
      ipcRenderer.on('lcu:gameflow-phase', handler)
      return () => ipcRenderer.removeListener('lcu:gameflow-phase', handler)
    },
    onGameflowSession: (callback: (session: any) => void) => {
      const handler = (_e: any, session: any) => callback(session)
      ipcRenderer.on('lcu:gameflow-session', handler)
      return () => ipcRenderer.removeListener('lcu:gameflow-session', handler)
    },
    onEndOfGameStats: (callback: (stats: any) => void) => {
      const handler = (_e: any, stats: any) => callback(stats)
      ipcRenderer.on('lcu:eog-stats', handler)
      return () => ipcRenderer.removeListener('lcu:eog-stats', handler)
    },
    onSummonerInfo: (callback: (info: any) => void) => {
      const handler = (_e: any, info: any) => callback(info)
      ipcRenderer.on('lcu:summoner-info', handler)
      return () => ipcRenderer.removeListener('lcu:summoner-info', handler)
    }
  },

  // Live Game API (2999)
  livegame: {
    getStatus: () => ipcRenderer.invoke('livegame:status'),

    onAttached: (callback: (stats: any) => void) => {
      const handler = (_e: any, stats: any) => callback(stats)
      ipcRenderer.on('livegame:attached', handler)
      return () => ipcRenderer.removeListener('livegame:attached', handler)
    },
    onDetached: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('livegame:detached', handler)
      return () => ipcRenderer.removeListener('livegame:detached', handler)
    },
    onStatsUpdate: (callback: (stats: any) => void) => {
      const handler = (_e: any, stats: any) => callback(stats)
      ipcRenderer.on('livegame:stats-update', handler)
      return () => ipcRenderer.removeListener('livegame:stats-update', handler)
    },
    onTFTRoundChange: (callback: (tftState: any) => void) => {
      const handler = (_e: any, tftState: any) => callback(tftState)
      ipcRenderer.on('livegame:tft-round-change', handler)
      return () => ipcRenderer.removeListener('livegame:tft-round-change', handler)
    }
  }
})

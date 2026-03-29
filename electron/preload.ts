import { contextBridge, ipcRenderer } from 'electron'

// ─── Expose Safe APIs to Renderer ───────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  // Overlay controls
  overlay: {
    toggleInteractive: (interactive: boolean) => ipcRenderer.invoke('overlay:toggle-interactive', interactive),
    toggleVisibility: () => ipcRenderer.invoke('overlay:toggle-visibility'),
    hide: () => ipcRenderer.invoke('overlay:hide'),
    setOpacity: (opacity: number) => ipcRenderer.invoke('overlay:set-opacity', opacity),
    show: () => ipcRenderer.invoke('overlay:show'),
    hideMgr: () => ipcRenderer.invoke('overlay:hide-manager'),
    toggleVisibilityNow: () => ipcRenderer.invoke('overlay:toggle-visibility-now'),
    toggleInteractiveNow: () => ipcRenderer.invoke('overlay:toggle-interactive-now'),
    getHotkeys: () => ipcRenderer.invoke('overlay:get-hotkeys'),
    setInteractKey: (key: string) => ipcRenderer.invoke('overlay:set-interact-key', key),
    setVisibilityKey: (key: string) => ipcRenderer.invoke('overlay:set-visibility-key', key),
    getState: () => ipcRenderer.invoke('overlay:get-state'),

    // Window size/position persistence
    getWindowBounds: () => ipcRenderer.invoke('overlay:get-bounds'),
    saveWindowBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('overlay:save-bounds', bounds),
    // Resize to preset
    setCompactMode: (compact: boolean) => ipcRenderer.invoke('overlay:set-compact', compact),

    onInteractiveState: (callback: (interactive: boolean) => void) => {
      const handler = (_e: any, interactive: boolean) => callback(interactive)
      ipcRenderer.on('overlay:interactive-state', handler)
      return () => ipcRenderer.removeListener('overlay:interactive-state', handler)
    },
    onStateChanged: (callback: (state: { isVisible: boolean; isInteractive: boolean }) => void) => {
      const handler = (_e: any, state: any) => callback(state)
      ipcRenderer.on('overlay:state-changed', handler)
      return () => ipcRenderer.removeListener('overlay:state-changed', handler)
    },
    onHotkeysChanged: (callback: (hotkeys: { interactKey: string; visibilityKey: string }) => void) => {
      const handler = (_e: any, hotkeys: any) => callback(hotkeys)
      ipcRenderer.on('overlay:hotkeys-changed', handler)
      return () => ipcRenderer.removeListener('overlay:hotkeys-changed', handler)
    }
  },

  // Clipboard — always via main process (renderer clipboard fails when not focused)
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  },

  // MetaTFT + generic API fetch proxy (bypasses CORS)
  metaTFT: {
    scrapeLiveComps: () => ipcRenderer.invoke('scrape:metatft'),
    apiFetch: (url: string) => ipcRenderer.invoke('api:fetch', url),
  },

  // Riot API key management (stored via safeStorage in main)
  riotApi: {
    getKey: () => ipcRenderer.invoke('riot:get-key'),
    setKey: (key: string) => ipcRenderer.invoke('riot:set-key', key),
    getRegion: () => ipcRenderer.invoke('riot:get-region'),
    setRegion: (region: string) => ipcRenderer.invoke('riot:set-region', region),
  },

  // LCU via lcu-connector & ws
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
    },
    // Lobby participants for rival scouting
    onLobbyParticipants: (callback: (participants: any[]) => void) => {
      const handler = (_e: any, participants: any[]) => callback(participants)
      ipcRenderer.on('lcu:lobby-participants', handler)
      return () => ipcRenderer.removeListener('lcu:lobby-participants', handler)
    },
  },

  // Live Game API (port 2999 + TFTGameEngine)
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
    },
    // New — full TFT live state from TFTGameEngine
    onTFTState: (callback: (state: any) => void) => {
      const handler = (_e: any, state: any) => callback(state)
      ipcRenderer.on('livegame:tft-state', handler)
      return () => ipcRenderer.removeListener('livegame:tft-state', handler)
    },
  },

  // Notification bar
  notif: {
    onNotification: (callback: (payload: any) => void) => {
      const handler = (_e: any, payload: any) => callback(payload)
      ipcRenderer.on('notif:push', handler)
      return () => ipcRenderer.removeListener('notif:push', handler)
    },
    push:         (payload: any) => ipcRenderer.send('notif:push', payload),
    notifyEmpty:  ()             => ipcRenderer.send('notif:empty'),
    notifyActive: ()             => ipcRenderer.send('notif:active'),
    test:         ()             => ipcRenderer.send('notif:test'),
    getBounds:    ()             => ipcRenderer.invoke('notif:get-bounds'),
    saveBounds:   (b: any)       => ipcRenderer.invoke('notif:save-bounds', b),
  },

  // Logs
  logs: {
    openLogFile: () => ipcRenderer.invoke('logs:open'),
  },
})

// Expose raw ipcRenderer for direct channel subscriptions (NotificationBar tft-state)
contextBridge.exposeInMainWorld('__ipc', {
  on: (channel: string, handler: (...args: any[]) => void) => {
    const wrapper = (_e: any, ...args: any[]) => handler(...args)
    ipcRenderer.on(channel, wrapper)
    return wrapper
  },
  removeListener: (channel: string, handler: any) => {
    ipcRenderer.removeListener(channel, handler)
  },
})


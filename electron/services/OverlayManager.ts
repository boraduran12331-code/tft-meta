import { BrowserWindow, globalShortcut, ipcMain } from 'electron'

/**
 * OverlayManager — v2
 *
 * Manages the overlay window's interaction state, visibility,
 * and configurable global hotkeys.
 *
 * Hotkeys:
 *   - interactKey: toggle click-through mode (default: Alt+Space)
 *   - visibilityKey: show/hide overlay (default: Alt+H)
 *
 * Both are user-configurable at runtime via IPC.
 */
export class OverlayManager {
  private window: BrowserWindow
  private mainWindow: BrowserWindow | null = null
  private isInteractive = false
  private isVisible = false

  private interactKey = 'Alt+Space'
  private visibilityKey = 'Alt+H'

  constructor(overlayWindow: BrowserWindow, mainWindow?: BrowserWindow | null) {
    this.window = overlayWindow
    this.mainWindow = mainWindow ?? null
    this.registerHotkeys()
    this.registerIPC()
  }

  // ─── Hotkey Registration ──────────────────────────────────

  private registerHotkeys() {
    this.safeRegister(this.interactKey, () => this.toggleInteractive())
    this.safeRegister(this.visibilityKey, () => this.toggleVisibility())
  }

  private unregisterHotkeys() {
    globalShortcut.unregister(this.interactKey)
    globalShortcut.unregister(this.visibilityKey)
  }

  private safeRegister(key: string, cb: () => void) {
    try {
      if (globalShortcut.isRegistered(key)) {
        globalShortcut.unregister(key)
      }
      const ok = globalShortcut.register(key, cb)
      if (!ok) console.warn(`[OverlayManager] Could not register hotkey: ${key}`)
    } catch (err) {
      console.error(`[OverlayManager] Error registering ${key}:`, err)
    }
  }

  // ─── IPC Handlers ────────────────────────────────────────

  private registerIPC() {
    // Get current hotkeys
    ipcMain.handle('overlay:get-hotkeys', () => ({
      interactKey: this.interactKey,
      visibilityKey: this.visibilityKey,
    }))

    // Set interact key
    ipcMain.handle('overlay:set-interact-key', (_event, key: string) => {
      return this.setInteractKey(key)
    })

    // Set visibility key
    ipcMain.handle('overlay:set-visibility-key', (_event, key: string) => {
      return this.setVisibilityKey(key)
    })

    // Show overlay (from ControlPanel button)
    ipcMain.handle('overlay:show', () => {
      this.showOverlay()
    })

    // Hide overlay (from ControlPanel button)
    ipcMain.handle('overlay:hide-manager', () => {
      this.hideOverlay()
    })

    // Legacy: called by OverlayPanel's ✕ close button via overlay.hide()
    ipcMain.handle('overlay:hide', () => {
      this.hideOverlay()
    })

    // Legacy: called by OverlayPanel via overlay.toggleInteractive()
    ipcMain.handle('overlay:toggle-interactive', (_event, interactive: boolean) => {
      if (interactive !== this.isInteractive) {
        this.toggleInteractive()
      }
    })

    // Legacy: overlay.toggleVisibility()
    ipcMain.handle('overlay:toggle-visibility', () => {
      this.toggleVisibility()
    })

    // Toggle visibility (from ControlPanel button)
    ipcMain.handle('overlay:toggle-visibility-now', () => {
      this.toggleVisibility()
    })

    // Toggle interactive (from ControlPanel button)
    ipcMain.handle('overlay:toggle-interactive-now', () => {
      this.toggleInteractive()
    })

    // Get current overlay state
    ipcMain.handle('overlay:get-state', () => ({
      isVisible: this.isVisible,
      isInteractive: this.isInteractive,
      interactKey: this.interactKey,
      visibilityKey: this.visibilityKey,
    }))
  }

  // ─── Public Actions ───────────────────────────────────────

  setInteractKey(newKey: string): { success: boolean; error?: string } {
    try {
      globalShortcut.unregister(this.interactKey)
      const ok = globalShortcut.register(newKey, () => this.toggleInteractive())
      if (!ok) {
        // re-register old key if new one failed
        globalShortcut.register(this.interactKey, () => this.toggleInteractive())
        return { success: false, error: `"${newKey}" zaten başka bir uygulama tarafından kullanılıyor` }
      }
      this.interactKey = newKey
      this.broadcast('overlay:hotkeys-changed', { interactKey: this.interactKey, visibilityKey: this.visibilityKey })
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  setVisibilityKey(newKey: string): { success: boolean; error?: string } {
    try {
      globalShortcut.unregister(this.visibilityKey)
      const ok = globalShortcut.register(newKey, () => this.toggleVisibility())
      if (!ok) {
        globalShortcut.register(this.visibilityKey, () => this.toggleVisibility())
        return { success: false, error: `"${newKey}" zaten başka bir uygulama tarafından kullanılıyor` }
      }
      this.visibilityKey = newKey
      this.broadcast('overlay:hotkeys-changed', { interactKey: this.interactKey, visibilityKey: this.visibilityKey })
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  toggleInteractive() {
    if (!this.window || this.window.isDestroyed()) return
    this.isInteractive = !this.isInteractive

    if (this.isInteractive) {
      this.window.setIgnoreMouseEvents(false)
      this.window.setFocusable(true)
      this.window.focus()
    } else {
      this.window.setIgnoreMouseEvents(true, { forward: true })
      this.window.setFocusable(false)
    }

    this.window.webContents.send('overlay:interactive-state', this.isInteractive)
    this.broadcast('overlay:state-changed', { isVisible: this.isVisible, isInteractive: this.isInteractive })
  }

  showOverlay() {
    if (!this.window || this.window.isDestroyed()) return
    this.window.show()
    this.isVisible = true
    this.broadcast('overlay:state-changed', { isVisible: true, isInteractive: this.isInteractive })
  }

  hideOverlay() {
    if (!this.window || this.window.isDestroyed()) return
    this.window.hide()
    this.isVisible = false
    // Also deactivate interactive when hiding
    if (this.isInteractive) {
      this.isInteractive = false
      this.window.setIgnoreMouseEvents(true, { forward: true })
    }
    this.broadcast('overlay:state-changed', { isVisible: false, isInteractive: false })
  }

  toggleVisibility() {
    if (!this.window || this.window.isDestroyed()) return
    if (this.window.isVisible()) {
      this.hideOverlay()
    } else {
      this.showOverlay()
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  private broadcast(channel: string, payload: any) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, payload)
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, payload)
    }
  }

  getState() {
    return {
      isVisible: this.isVisible,
      isInteractive: this.isInteractive,
      interactKey: this.interactKey,
      visibilityKey: this.visibilityKey,
    }
  }

  destroy() {
    this.unregisterHotkeys()
    ipcMain.removeHandler('overlay:get-hotkeys')
    ipcMain.removeHandler('overlay:set-interact-key')
    ipcMain.removeHandler('overlay:set-visibility-key')
    ipcMain.removeHandler('overlay:show')
    ipcMain.removeHandler('overlay:hide-manager')
    ipcMain.removeHandler('overlay:hide')
    ipcMain.removeHandler('overlay:toggle-interactive')
    ipcMain.removeHandler('overlay:toggle-visibility')
    ipcMain.removeHandler('overlay:toggle-visibility-now')
    ipcMain.removeHandler('overlay:toggle-interactive-now')
    ipcMain.removeHandler('overlay:get-state')
  }
}

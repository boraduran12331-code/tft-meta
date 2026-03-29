// electron/services/WindowStateService.ts
// Persists overlay window position & size across restarts

import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

interface WindowState {
  overlay: WindowBounds
}

const DEFAULT_OVERLAY: WindowBounds = {
  x: -1,    // -1 = auto-position to right side
  y: 80,
  width: 340,
  height: 640,
}

export class WindowStateService {
  private stateFile: string
  private state: WindowState

  constructor() {
    this.stateFile = join(app.getPath('userData'), 'window-state.json')
    this.state = this.load()
  }

  private load(): WindowState {
    try {
      if (existsSync(this.stateFile)) {
        const raw = readFileSync(this.stateFile, 'utf-8')
        return JSON.parse(raw)
      }
    } catch { /* ignore */ }
    return { overlay: { ...DEFAULT_OVERLAY } }
  }

  save(win: BrowserWindow, key: keyof WindowState = 'overlay') {
    try {
      const bounds = win.getBounds()
      this.state[key] = bounds
      writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2))
    } catch { /* ignore */ }
  }

  getOverlayBounds(): WindowBounds {
    const saved = this.state.overlay
    const { bounds: displayBounds } = screen.getPrimaryDisplay()

    // Clamp to screen bounds
    const x = saved.x < 0
      ? displayBounds.width - saved.width - 20
      : Math.max(0, Math.min(saved.x, displayBounds.width - saved.width))
    const y = Math.max(0, Math.min(saved.y, displayBounds.height - saved.height))
    const width  = Math.max(280, Math.min(saved.width,  560))
    const height = Math.max(400, Math.min(saved.height, displayBounds.height - 40))

    return { x, y, width, height }
  }
}

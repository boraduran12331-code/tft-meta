import { app, BrowserWindow, clipboard, ipcMain, screen } from 'electron'
import { join } from 'path'
import * as https from 'https'
import { RiotClientGateway } from './services/RiotClientGateway'
import { LiveGameGateway } from './services/LiveGameGateway'
import { OverlayManager } from './services/OverlayManager'
import { registerMetaTFTScraperIPC } from './services/MetaTFTScraper'

// ─── Globals ────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
const riotClient = new RiotClientGateway()
const liveGame = new LiveGameGateway()
let overlayManager: OverlayManager | null = null

// ─── Main Window (Control Panel) ────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 680,
    minWidth: 380,
    minHeight: 500,
    title: 'Antigravity TFT Companion',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    transparent: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── Overlay Window (Transparent, Always-On-Top) ────────
function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize

  overlayWindow = new BrowserWindow({
    width: 340,
    height: 600,
    x: width - 360,
    y: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Start hidden until game starts
  overlayWindow.hide()

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  if (process.env.VITE_DEV_SERVER_URL) {
    overlayWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/overlay`)
    // Open overlay DevTools for debugging
    overlayWindow.webContents.once('did-finish-load', () => {
      overlayWindow?.webContents.openDevTools({ mode: 'detach' })
    })
  } else {
    overlayWindow.loadFile(join(__dirname, '../dist/index.html'), {
      hash: '/overlay',
    })
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  // Pass mainWindow so OverlayManager can broadcast state to both windows
  overlayManager = new OverlayManager(overlayWindow, mainWindow)

  return overlayWindow
}

// ─── IPC Handlers ───────────────────────────────────────
function setupIPC() {
  registerMetaTFTScraperIPC()

  // NOTE: overlay:toggle-interactive, overlay:toggle-visibility, overlay:hide,
  // overlay:show, overlay:hide-manager, overlay:toggle-visibility-now,
  // overlay:toggle-interactive-now, overlay:get-hotkeys, overlay:set-interact-key,
  // overlay:set-visibility-key, overlay:get-state
  // → All handled inside OverlayManager.registerIPC() above.
  // Only keep handlers OverlayManager does NOT own:

  ipcMain.handle('lcu:status', () => {
    return riotClient.getStatus()
  })

  ipcMain.handle('livegame:status', () => {
    return liveGame.getStats()
  })

  ipcMain.handle('overlay:set-opacity', (_event, opacity: number) => {
    if (overlayWindow) {
      overlayWindow.setOpacity(opacity)
    }
  })

  ipcMain.handle('clipboard:write-text', (_event, text: string) => {
    clipboard.writeText(text)
    return true
  })

  // Generic HTTPS fetch proxy — bypasses renderer CORS restrictions
  ipcMain.handle('api:fetch', async (_event, url: string) => {
    return new Promise<string>((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve(data))
        res.on('error', reject)
      }).on('error', reject)
    })
  })
}

// ─── App Lifecycle ──────────────────────────────────────
app.whenReady().then(async () => {
  setupIPC()
  createMainWindow()
  createOverlayWindow()

  // Start Gateway Tracking
  riotClient.start()

  riotClient.on('connected', (info) => {
    mainWindow?.webContents.send('lcu:connected', info)
    overlayWindow?.webContents.send('lcu:connected', info)
  })

  riotClient.on('disconnected', () => {
    mainWindow?.webContents.send('lcu:disconnected')
    overlayWindow?.webContents.send('lcu:disconnected')
  })

  riotClient.on('gameflow-phase', (phase: string) => {
    mainWindow?.webContents.send('lcu:gameflow-phase', phase)
    overlayWindow?.webContents.send('lcu:gameflow-phase', phase)

    if (phase === 'InProgress') {
      liveGame.attach()
      overlayWindow?.show()
    } else if (phase === 'None') {
      liveGame.detach()
    }
  })

  riotClient.on('gameflow-session', (session: any) => {
    mainWindow?.webContents.send('lcu:gameflow-session', session)
    overlayWindow?.webContents.send('lcu:gameflow-session', session)
  })

  riotClient.on('eog-stats', (stats: any) => {
    mainWindow?.webContents.send('lcu:eog-stats', stats)
    overlayWindow?.webContents.send('lcu:eog-stats', stats)
  })

  riotClient.on('summoner-info', (info: any) => {
    mainWindow?.webContents.send('lcu:summoner-info', info)
    overlayWindow?.webContents.send('lcu:summoner-info', info)
  })

  liveGame.on('attached', (stats: any) => {
    mainWindow?.webContents.send('livegame:attached', stats)
    overlayWindow?.webContents.send('livegame:attached', stats)
  })

  liveGame.on('detached', () => {
    mainWindow?.webContents.send('livegame:detached')
    overlayWindow?.webContents.send('livegame:detached')
  })

  liveGame.on('stats-update', (stats: any) => {
    mainWindow?.webContents.send('livegame:stats-update', stats)
    overlayWindow?.webContents.send('livegame:stats-update', stats)
  })

  liveGame.on('tft-round-change', (tftState: any) => {
    mainWindow?.webContents.send('livegame:tft-round-change', tftState)
    overlayWindow?.webContents.send('livegame:tft-round-change', tftState)
  })
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  riotClient.stop()
  liveGame.detach()
})

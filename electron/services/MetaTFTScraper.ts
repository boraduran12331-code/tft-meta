import { BrowserWindow, ipcMain } from 'electron'

/**
 * MetaTFT Scraper (Electron Main Process)
 *
 * Strategy: Load metatft.com/comps in a hidden Electron window,
 * wait for JS to execute, then extract window.__NEXT_DATA__ which
 * contains all comp data in structured JSON — no DOM scraping needed.
 *
 * Cloudflare bypass: We let Electron's Chromium solve the JS challenge
 * naturally (no headless mode = real browser fingerprint).
 */

const METATFT_URL = 'https://www.metatft.com/comps'
const TIMEOUT_MS = 20000
const CHALLENGE_WAIT_MS = 6000  // Wait for Cloudflare challenge to resolve

export function registerMetaTFTScraperIPC(): void {
  ipcMain.handle('scrape:metatft', async () => {
    return scrapeMetaTFT()
  })
}

async function scrapeMetaTFT(): Promise<any> {
  return new Promise((resolve, reject) => {
    let resolved = false

    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        javascript: true,
        images: false,     // Skip images for speed
      },
    })

    // Use a real Chrome UA to bypass Cloudflare
    win.webContents.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    )

    const cleanup = (data: any, error?: Error) => {
      if (resolved) return
      resolved = true
      clearTimeout(hardTimeout)
      if (!win.isDestroyed()) win.close()
      if (error) reject(error)
      else resolve(data)
    }

    const hardTimeout = setTimeout(() => {
      cleanup(null, new Error(`MetaTFT scrape timeout after ${TIMEOUT_MS}ms`))
    }, TIMEOUT_MS)

    const tryExtract = async (): Promise<boolean> => {
      try {
        const raw = await win.webContents.executeJavaScript(`
          (function() {
            try {
              if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props) {
                return JSON.stringify(window.__NEXT_DATA__);
              }
              return null;
            } catch(e) {
              return null;
            }
          })()
        `)

        if (raw) {
          console.log('[MetaTFTScraper] ✅ __NEXT_DATA__ extracted successfully')
          cleanup(JSON.parse(raw))
          return true
        }
        return false
      } catch {
        return false
      }
    }

    win.webContents.on('did-finish-load', async () => {
      console.log('[MetaTFTScraper] Page loaded, attempting extraction...')

      // First try immediately
      const immediate = await tryExtract()
      if (immediate) return

      // Cloudflare might have shown a challenge page — wait and retry
      console.log('[MetaTFTScraper] __NEXT_DATA__ not ready, waiting for Cloudflare...')
      await new Promise(r => setTimeout(r, CHALLENGE_WAIT_MS))

      const delayed = await tryExtract()
      if (!delayed) {
        console.warn('[MetaTFTScraper] Extraction failed after challenge wait')
        cleanup(null)
      }
    })

    win.webContents.on('did-fail-load', (_, code, desc) => {
      cleanup(null, new Error(`Scraper load failed: ${desc} (${code})`))
    })

    console.log('[MetaTFTScraper] Loading metatft.com/comps...')
    win.loadURL(METATFT_URL)
  })
}

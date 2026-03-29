import { EventEmitter } from 'events'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * ProcessMonitor
 * Detects when League of Legends / TFT is running on macOS.
 * Uses `pgrep` polling — lightweight and Vanguard-safe.
 */
export class ProcessMonitor extends EventEmitter {
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private isLeagueRunning = false
  private readonly POLL_MS = 3000
  // macOS process names for League
  private readonly PROCESS_NAMES = [
    'LeagueofLegends',
    'League of Legends',
    'LeagueClient',
    'RiotClientServices',
  ]

  start() {
    if (this.pollInterval) return
    console.log('[ProcessMonitor] Starting League detection polling...')

    // Initial check
    this.checkProcesses()

    this.pollInterval = setInterval(() => {
      this.checkProcesses()
    }, this.POLL_MS)
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  getStatus() {
    return {
      isLeagueRunning: this.isLeagueRunning,
      monitoring: this.pollInterval !== null,
    }
  }

  private async checkProcesses() {
    try {
      const wasRunning = this.isLeagueRunning

      // pgrep is the safest way — no memory reading, just PID lookup
      const results = await Promise.all(
        this.PROCESS_NAMES.map(async (name) => {
          try {
            const { stdout } = await execAsync(`pgrep -f "${name}"`)
            return stdout.trim().length > 0
          } catch {
            // pgrep exits with 1 if no match — expected
            return false
          }
        })
      )

      this.isLeagueRunning = results.some(Boolean)

      // Emit state transitions
      if (!wasRunning && this.isLeagueRunning) {
        console.log('[ProcessMonitor] ✓ League of Legends detected!')
        this.emit('league-detected')
      } else if (wasRunning && !this.isLeagueRunning) {
        console.log('[ProcessMonitor] ✗ League of Legends closed.')
        this.emit('league-closed')
      }
    } catch (err) {
      console.error('[ProcessMonitor] Error checking processes:', err)
    }
  }
}

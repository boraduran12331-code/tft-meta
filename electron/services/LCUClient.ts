import { EventEmitter } from 'events'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import https from 'https'
import WebSocket from 'ws'

/**
 * LCUClient — League Client Update API Client (v2)
 *
 * Event-driven architecture using WebSocket subscriptions instead of polling.
 * Supports macOS lockfile discovery via pgrep+lsof (most reliable) and static paths.
 *
 * Events emitted:
 *   - 'connected'          → LCU connection established
 *   - 'disconnected'       → LCU connection lost
 *   - 'game-state-change'  → { phase, connected, summoner, ... }
 *   - 'game-start'         → game entered "InProgress"
 *   - 'game-end'           → game left "InProgress"
 *   - 'tft-session'        → TFT-specific session data
 */

// ─── Types ──────────────────────────────────────────────

interface LCUCredentials {
  processId: number
  port: number
  password: string
  protocol: string
}

export type GamePhase =
  | 'None'
  | 'Lobby'
  | 'Matchmaking'
  | 'ReadyCheck'
  | 'ChampSelect'
  | 'InProgress'
  | 'WaitingForStats'
  | 'PreEndOfGame'
  | 'EndOfGame'

export interface SummonerInfo {
  displayName: string
  puuid: string
  summonerId: number
  profileIconId: number
  summonerLevel: number
}

export interface TFTRankedInfo {
  tier: string
  division: string
  leaguePoints: number
  wins: number
  losses: number
}

export interface GameState {
  phase: GamePhase
  connected: boolean
  summoner?: SummonerInfo
  ranked?: TFTRankedInfo
  isTFT: boolean
  queueId?: number
}

// TFT queue IDs
const TFT_QUEUE_IDS = [1090, 1100, 1130, 1160]

// ─── WebSocket Event Subscriptions ───────────────────────
const WS_SUBSCRIPTIONS = [
  'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase',
  'OnJsonApiEvent_lol-gameflow_v1_session',
  'OnJsonApiEvent_lol-end-of-game_v1_eog-stats-block',
  'OnJsonApiEvent_lol-summoner_v1_current-summoner',
]

export class LCUClient extends EventEmitter {
  private credentials: LCUCredentials | null = null
  private connected = false
  private ws: WebSocket | null = null
  private currentPhase: GamePhase = 'None'
  private summoner: SummonerInfo | null = null
  private ranked: TFTRankedInfo | null = null
  private isTFT = false
  private queueId: number | undefined = undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly RECONNECT_MS = 5000

  // ─── macOS lockfile paths (static fallback) ────────────
  private readonly LOCKFILE_PATHS = [
    '/Applications/League of Legends.app/Contents/LoL/lockfile',
    join(homedir(), 'Applications/League of Legends.app/Contents/LoL/lockfile'),
    join(homedir(), 'Library/Application Support/Riot Games/Riot Client/Config/lockfile'),
  ]

  // ═══════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════

  async connect(): Promise<boolean> {
    try {
      this.credentials = await this.discoverCredentials()
      if (!this.credentials) {
        console.warn('[LCU] Could not find lockfile — is the client running?')
        return false
      }

      console.log(`[LCU] Credentials found — port ${this.credentials.port}`)

      // Fetch initial data via HTTP
      await this.fetchSummonerInfo()
      await this.fetchRankedInfo()

      // Open WebSocket for real-time events
      this.connectWebSocket()

      this.connected = true
      this.emit('connected')
      return true
    } catch (err) {
      console.error('[LCU] Connection failed:', err)
      return false
    }
  }

  disconnect() {
    this.closeWebSocket()
    this.credentials = null
    this.connected = false
    this.currentPhase = 'None'
    this.summoner = null
    this.ranked = null
    this.isTFT = false

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.emit('disconnected')
  }

  getStatus() {
    return {
      connected: this.connected,
      port: this.credentials?.port ?? null,
    }
  }

  getGameState(): GameState {
    return {
      phase: this.currentPhase,
      connected: this.connected,
      summoner: this.summoner ?? undefined,
      ranked: this.ranked ?? undefined,
      isTFT: this.isTFT,
      queueId: this.queueId,
    }
  }

  /**
   * Make an HTTP GET request to any LCU endpoint
   */
  async request<T = any>(endpoint: string): Promise<T | null> {
    if (!this.credentials) return null

    return new Promise((resolve) => {
      const options = {
        hostname: '127.0.0.1',
        port: this.credentials!.port,
        path: endpoint,
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
        },
        rejectUnauthorized: false, // self-signed cert
      }

      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as T)
          } catch {
            // Some endpoints return plain string (e.g. gameflow-phase)
            resolve(data as unknown as T)
          }
        })
      })

      req.on('error', () => resolve(null))
      req.setTimeout(3000, () => {
        req.destroy()
        resolve(null)
      })
      req.end()
    })
  }

  // ═══════════════════════════════════════════════════════
  // LOCKFILE DISCOVERY
  // ═══════════════════════════════════════════════════════

  /**
   * Discover LCU credentials.
   * Strategy: pgrep+lsof (most reliable on Mac) → static paths fallback
   */
  private async discoverCredentials(): Promise<LCUCredentials | null> {
    // Method 1: pgrep + lsof (dynamic, works even if install path is non-standard)
    const dynamicPath = this.findLockfileByProcess()
    if (dynamicPath) {
      const creds = await this.parseLockfile(dynamicPath)
      if (creds) {
        console.log(`[LCU] Found lockfile via pgrep+lsof: ${dynamicPath}`)
        return creds
      }
    }

    // Method 2: Static known paths
    for (const path of this.LOCKFILE_PATHS) {
      if (!existsSync(path)) continue
      const creds = await this.parseLockfile(path)
      if (creds) {
        console.log(`[LCU] Found lockfile at static path: ${path}`)
        return creds
      }
    }

    return null
  }

  /**
   * Find lockfile path dynamically via pgrep + lsof
   */
  private findLockfileByProcess(): string | null {
    try {
      const pid = execSync('pgrep -x LeagueClient 2>/dev/null', {
        encoding: 'utf8',
      }).trim()
      if (!pid) return null

      const lsof = execSync(`lsof -p ${pid} 2>/dev/null | grep lockfile`, {
        encoding: 'utf8',
      })
      const match = lsof.match(/\s(\/[^\s]+lockfile)/)
      return match ? match[1] : null
    } catch {
      return null
    }
  }

  /**
   * Parse lockfile content → credentials
   * Format: processName:pid:port:password:protocol
   */
  private async parseLockfile(path: string): Promise<LCUCredentials | null> {
    try {
      const content = await readFile(path, 'utf-8')
      const parts = content.trim().split(':')
      if (parts.length >= 5) {
        return {
          processId: parseInt(parts[1], 10),
          port: parseInt(parts[2], 10),
          password: parts[3],
          protocol: parts[4],
        }
      }
    } catch {
      // File may be temporarily locked during write
    }
    return null
  }

  private get authHeader(): string {
    return (
      'Basic ' + Buffer.from(`riot:${this.credentials!.password}`).toString('base64')
    )
  }

  // ═══════════════════════════════════════════════════════
  // WEBSOCKET (EVENT-DRIVEN)
  // ═══════════════════════════════════════════════════════

  private connectWebSocket() {
    if (!this.credentials) return
    this.closeWebSocket()

    const wsUrl = `wss://127.0.0.1:${this.credentials.port}`

    this.ws = new WebSocket(wsUrl, {
      headers: { Authorization: this.authHeader },
      rejectUnauthorized: false, // self-signed cert
    })

    this.ws.on('open', () => {
      console.log('[LCU/WS] Connected — subscribing to events...')
      // Subscribe to events (opcode 5 = Subscribe)
      for (const event of WS_SUBSCRIPTIONS) {
        this.ws!.send(JSON.stringify([5, event]))
      }
      console.log(`[LCU/WS] Subscribed to ${WS_SUBSCRIPTIONS.length} events`)
    })

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (!Array.isArray(msg) || msg.length < 3) return

        const [opcode, event, payload] = msg
        if (opcode !== 8) return // 8 = Event

        this.handleWSEvent(event as string, payload)
      } catch (err) {
        // Ignore parse errors on non-JSON messages
      }
    })

    this.ws.on('close', () => {
      console.log('[LCU/WS] Disconnected')
      this.ws = null
      this.scheduleReconnect()
    })

    this.ws.on('error', (err) => {
      console.warn('[LCU/WS] Error:', (err as Error).message)
    })
  }

  private closeWebSocket() {
    if (this.ws) {
      this.ws.removeAllListeners()
      try {
        this.ws.close()
      } catch {
        // Already closed
      }
      this.ws = null
    }
  }

  private scheduleReconnect() {
    if (!this.credentials || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.credentials) {
        console.log('[LCU/WS] Attempting reconnect...')
        this.connectWebSocket()
      }
    }, this.RECONNECT_MS)
  }

  // ═══════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════

  private handleWSEvent(event: string, payload: any) {
    const data = payload?.data

    // ─── Game Phase Change ─────────────────────────────
    if (event === 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase') {
      const newPhase = (typeof data === 'string' ? data : data?.toString()) as GamePhase
      if (newPhase && newPhase !== this.currentPhase) {
        const oldPhase = this.currentPhase
        this.currentPhase = newPhase
        console.log(`[LCU] Phase: ${oldPhase} → ${newPhase}`)

        // Emit specific lifecycle events
        if (newPhase === 'InProgress' && oldPhase !== 'InProgress') {
          this.emit('game-start')
        }
        if (oldPhase === 'InProgress' && newPhase !== 'InProgress') {
          this.emit('game-end')
        }

        this.emit('game-state-change', this.getGameState())
      }
    }

    // ─── Session Update (detect TFT queue) ──────────────
    if (event === 'OnJsonApiEvent_lol-gameflow_v1_session') {
      const queueId = data?.gameData?.queue?.id
      if (queueId !== undefined) {
        this.queueId = queueId
        this.isTFT = TFT_QUEUE_IDS.includes(queueId)
        console.log(
          `[LCU] Queue: ${queueId} — ${this.isTFT ? 'TFT ✓' : 'not TFT'}`
        )
        this.emit('tft-session', {
          isTFT: this.isTFT,
          queueId,
          queueType: data?.gameData?.queue?.type,
        })
      }
    }

    // ─── End of Game Stats ──────────────────────────────
    if (event === 'OnJsonApiEvent_lol-end-of-game_v1_eog-stats-block') {
      console.log('[LCU] End of game stats received')
      this.emit('end-of-game', data)
    }

    // ─── Summoner Update ────────────────────────────────
    if (event === 'OnJsonApiEvent_lol-summoner_v1_current-summoner') {
      if (data?.displayName) {
        this.summoner = {
          displayName: data.displayName,
          puuid: data.puuid,
          summonerId: data.summonerId,
          profileIconId: data.profileIconId,
          summonerLevel: data.summonerLevel,
        }
        console.log(`[LCU] Summoner: ${this.summoner.displayName}`)
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // HTTP FETCHERS (initial data load)
  // ═══════════════════════════════════════════════════════

  private async fetchSummonerInfo() {
    const data = await this.request<any>('/lol-summoner/v1/current-summoner')
    if (data?.displayName) {
      this.summoner = {
        displayName: data.displayName,
        puuid: data.puuid,
        summonerId: data.summonerId,
        profileIconId: data.profileIconId,
        summonerLevel: data.summonerLevel,
      }
      console.log(`[LCU] Summoner: ${this.summoner.displayName} (Lv${this.summoner.summonerLevel})`)
    }
  }

  private async fetchRankedInfo() {
    const data = await this.request<any>('/lol-ranked/v1/current-ranked-stats')
    if (data?.queues) {
      const tftRank = data.queues.find(
        (q: any) => q.queueType === 'RANKED_TFT'
      )
      if (tftRank) {
        this.ranked = {
          tier: tftRank.tier,
          division: tftRank.division,
          leaguePoints: tftRank.leaguePoints,
          wins: tftRank.wins ?? 0,
          losses: tftRank.losses ?? 0,
        }
        console.log(
          `[LCU] TFT Rank: ${this.ranked.tier} ${this.ranked.division} (${this.ranked.leaguePoints} LP)`
        )
      }
    }
  }

  /**
   * Fetch current game flow phase (HTTP fallback if WS missed it)
   */
  async fetchCurrentPhase(): Promise<GamePhase> {
    const data = await this.request<string>('/lol-gameflow/v1/gameflow-phase')
    if (data) {
      const phase = (typeof data === 'string' ? data.replace(/"/g, '') : data) as GamePhase
      if (phase !== this.currentPhase) {
        this.currentPhase = phase
        this.emit('game-state-change', this.getGameState())
      }
      return phase
    }
    return this.currentPhase
  }
}

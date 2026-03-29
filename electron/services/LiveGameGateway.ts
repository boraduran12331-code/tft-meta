import { EventEmitter } from 'events'
import https from 'https'

export interface LiveGameStats {
  gameMode: string
  gameTime: number
  mapName: string
  mapNumber: number
}

export interface TFTPlayerState {
  summonerName: string
  position: number         // 1=1st place, 8=8th
  kills: number            // eliminations
  deaths: number           // times eliminated
  scores: Record<string, number>
}

export interface TFTGameState {
  gameTime: number
  estimatedRound: string
  players: TFTPlayerState[]
  activePlayer: TFTPlayerState | null
  nextOpponent: TFTPlayerState | null
}

/**
 * LiveGameGateway
 *
 * Polls the local Game Client (port 2999).
 * Fetches both /gamestats (timing) and /allgamedata (player list / TFT state).
 */
export class LiveGameGateway extends EventEmitter {
  private pollInterval: NodeJS.Timeout | null = null
  private isAttached: boolean = false
  public currentStats: LiveGameStats | null = null
  public currentTFTState: TFTGameState | null = null
  private lastRoundStr: string = ''

  constructor() {
    super()
  }

  public attach() {
    if (this.isAttached) return
    console.log('[LiveGameGateway] Attaching to Live Client API on port 2999...')
    this.isAttached = true
    this.startPolling()
  }

  public detach() {
    console.log('[LiveGameGateway] Detaching from Live Client API...')
    this.isAttached = false
    this.currentStats = null
    this.currentTFTState = null
    this.lastRoundStr = ''
    this.stopPolling()
    this.emit('detached')
  }

  private startPolling() {
    if (this.pollInterval) return

    this.pollInterval = setInterval(async () => {
      try {
        const [stats, allData] = await Promise.all([
          this.fetchGameStats(),
          this.fetchAllGameData().catch(() => null),
        ])

        if (!stats) return

        // First successful fetch
        if (!this.currentStats) {
          console.log('[LiveGameGateway] ✅ Connected to Live Client API')
          this.emit('attached', stats)
        }

        const timeChanged = !this.currentStats || Math.floor(stats.gameTime) !== Math.floor(this.currentStats.gameTime)
        this.currentStats = stats

        // Build TFT state if allGameData available
        if (allData && stats.gameMode === 'TFT') {
          const tftState = this.parseTFTState(stats.gameTime, allData)
          const roundChanged = tftState.estimatedRound !== this.lastRoundStr

          if (timeChanged || roundChanged) {
            this.currentTFTState = tftState
            if (roundChanged) {
              this.lastRoundStr = tftState.estimatedRound
              console.log(`[LiveGameGateway] TFT Round: ${tftState.estimatedRound}`)
              this.emit('tft-round-change', tftState)
            }
            this.emit('stats-update', { ...stats, tft: tftState })
          }
        } else if (timeChanged) {
          this.emit('stats-update', stats)
        }
      } catch {
        // Expected when game not active
      }
    }, 4000) // Poll every 4s for responsiveness
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  private estimateRound(gameTimeSec: number): string {
    const breakpoints: [number, string][] = [
      [0, '1-1'], [33, '1-2'], [66, '1-3'],
      [120, '2-1'], [150, '2-2'], [180, '2-3'], [210, '2-4'], [240, '2-5'],
      [300, '3-1'], [330, '3-2'], [360, '3-3'], [390, '3-4'], [420, '3-5'], [450, '3-6'],
      [510, '4-1'], [540, '4-2'], [570, '4-3'], [600, '4-4'], [630, '4-5'], [660, '4-6'],
      [720, '5-1'], [750, '5-2'], [780, '5-3'], [810, '5-4'], [840, '5-5'],
      [900, '6-1'], [930, '6-2'], [960, '6-3'], [990, '6-4'], [1020, '6-5'],
      [1080, '7-1'], [1110, '7-2'], [1140, '7-3'], [1170, '7-4'],
    ]
    let last = '1-1'
    for (const [t, r] of breakpoints) {
      if (gameTimeSec >= t) last = r
    }
    return last
  }

  private parseTFTState(gameTime: number, allData: any): TFTGameState {
    const estimatedRound = this.estimateRound(gameTime)
    const rawPlayers: any[] = allData?.allPlayers ?? []

    const players: TFTPlayerState[] = rawPlayers.map((p: any, i: number) => ({
      summonerName: p.summonerName ?? p.riotIdGameName ?? `Player ${i + 1}`,
      position: i + 1,
      kills: p.scores?.kills ?? 0,
      deaths: p.scores?.deaths ?? 0,
      scores: p.scores ?? {},
    }))

    // Sort by deaths ASC (fewer deaths = higher placement in TFT)
    players.sort((a, b) => a.deaths - b.deaths || b.kills - a.kills)
    players.forEach((p, i) => { p.position = i + 1 })

    const activePlayerName: string = allData?.activePlayer?.summonerName ?? ''
    const activePlayer = players.find(p => p.summonerName === activePlayerName) ?? null

    // Next opponent: TFT has a specific rotation but we use the player ranked closest below active player
    const aliveOpponents = players.filter(p => p.summonerName !== activePlayerName)
    const nextOpponent = aliveOpponents[0] ?? null // Ranked 1st opponent for now

    return { gameTime, estimatedRound, players, activePlayer, nextOpponent }
  }

  private fetchGameStats(): Promise<LiveGameStats> {
    return this.fetchJson<LiveGameStats>('https://127.0.0.1:2999/liveclientdata/gamestats')
  }

  private fetchAllGameData(): Promise<any> {
    return this.fetchJson<any>('https://127.0.0.1:2999/liveclientdata/allgamedata')
  }

  private fetchJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { rejectUnauthorized: false }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`LiveClient ${res.statusCode}`))
          return
        }
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try { resolve(JSON.parse(data)) }
          catch (e) { reject(e) }
        })
      })
      req.on('error', reject)
      req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')) })
    })
  }

  public getStats() { return this.currentStats }
  public getTFTState() { return this.currentTFTState }
}
